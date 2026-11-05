// STUDIODO — pembungkus C untuk Sony Camera Remote SDK.
//
// Cr_Core.dll hanya mengekspor API C++ (class + overload), tidak bisa di-P/Invoke
// langsung dari C#. DLL ini mengubahnya jadi fungsi extern "C" sederhana yang
// dipanggil bridge (SonyCamera.cs). Semua fungsi dipanggil dari SATU thread kamera;
// callback SDK datang dari thread SDK sendiri, jadi state bersama dijaga mutex.
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "CRSDK/CameraRemote_SDK.h"
#include "CRSDK/IDeviceCallback.h"
#include "CRSDK/ICrCameraObjectInfo.h"
#include "CRSDK/CrDeviceProperty.h"
#include "CRSDK/CrImageDataBlock.h"

namespace SDK = SCRSDK;
using namespace std::chrono_literals;

#define API extern "C" __declspec(dllexport)

namespace {

class Callback : public SDK::IDeviceCallback {
public:
    std::mutex m;
    std::condition_variable cv;
    bool connected = false;
    bool disconnected = false;
    uint32_t lastError = 0;
    std::wstring downloaded;  // nama file terakhir yang selesai diunduh
    bool hasDownload = false;

    void OnConnected(SDK::DeviceConnectionVersioin) override { std::lock_guard<std::mutex> l(m); connected = true; cv.notify_all(); }
    void OnDisconnected(CrInt32u) override { std::lock_guard<std::mutex> l(m); connected = false; disconnected = true; cv.notify_all(); }
    void OnError(CrInt32u error) override { std::lock_guard<std::mutex> l(m); lastError = error; cv.notify_all(); }
    void OnCompleteDownload(CrChar* filename, CrInt32u) override {
        std::lock_guard<std::mutex> l(m);
        downloaded = filename ? filename : L"";
        hasDownload = true;
        cv.notify_all();
    }
};

bool g_inited = false;
Callback* g_cb = nullptr;
SDK::CrDeviceHandle g_handle = 0;
SDK::ICrCameraObjectInfo* g_info = nullptr;
bool g_open = false;
std::vector<uint8_t> g_lvBuf;

void copyWide(const wchar_t* src, wchar_t* dst, int cap) {
    if (!dst || cap <= 0) return;
    wcsncpy_s(dst, cap, src ? src : L"", _TRUNCATE);
}

void setProp(uint32_t code, uint64_t value, SDK::CrDataType type) {
    SDK::CrDeviceProperty p;
    p.SetCode(code);
    p.SetCurrentValue(value);
    p.SetValueType(type);
    SDK::SetDeviceProperty(g_handle, &p);
}

int elemSize(SDK::CrDataType t) {
    switch (static_cast<uint32_t>(t) & 0x00FF) {
        case 1: return 1;
        case 2: return 2;
        case 3: return 4;
        case 4: return 8;
        default: return 0;
    }
}

}  // namespace

API int sony_init() {
    if (g_inited) return 0;
    if (!SDK::Init()) return -1;
    g_inited = true;
    return 0;
}

API void sony_shutdown() {
    if (g_open) {
        SDK::Disconnect(g_handle);
        SDK::ReleaseDevice(g_handle);
        g_open = false;
    }
    if (g_info) { g_info->Release(); g_info = nullptr; }
    delete g_cb; g_cb = nullptr;
    if (g_inited) { SDK::Release(); g_inited = false; }
}

// 0 = terhubung; 1 = tidak ada kamera; <0 / >1 = error SDK. name menerima nama model.
API int sony_connect(wchar_t* name, int nameCap, const wchar_t* saveDir) {
    if (g_open) return 0;
    if (!g_inited && sony_init() != 0) return -1;

    SDK::ICrEnumCameraObjectInfo* list = nullptr;
    auto err = SDK::EnumCameraObjects(&list, 2);
    if (CR_FAILED(err) || !list) return 1;
    if (list->GetCount() < 1) { list->Release(); return 1; }

    auto* found = list->GetCameraObjectInfo(0);
    g_info = SDK::CreateCameraObjectInfo(found->GetName(), found->GetModel(), found->GetUsbPid(), found->GetIdType(),
        found->GetIdSize(), found->GetId(), found->GetConnectionTypeName(), found->GetAdaptorName(),
        found->GetPairingNecessity(), found->GetSSHsupport());
    copyWide(found->GetModel(), name, nameCap);
    list->Release();

    delete g_cb;
    g_cb = new Callback();
    err = SDK::Connect(g_info, g_cb, &g_handle, SDK::CrSdkControlMode_Remote, SDK::CrReconnecting_ON);
    if (CR_FAILED(err)) { g_info->Release(); g_info = nullptr; return static_cast<int>(err) ? static_cast<int>(err) : -2; }

    {
        std::unique_lock<std::mutex> l(g_cb->m);
        if (!g_cb->cv.wait_for(l, 10s, [] { return g_cb->connected; })) {
            l.unlock();
            SDK::Disconnect(g_handle);
            SDK::ReleaseDevice(g_handle);
            g_info->Release(); g_info = nullptr;
            return -3;  // kamera ada tapi tidak merespons (cek mode "PC Remote" di menu kamera)
        }
    }
    g_open = true;

    std::wstring dir = saveDir ? saveDir : L".";
    SDK::SetSaveInfo(g_handle, const_cast<wchar_t*>(dir.c_str()), const_cast<wchar_t*>(L"cap"), -1);
    // Foto ke PC, dan kontrol dari PC mendahului tombol fisik. Gagal di sini tidak fatal:
    // tidak semua model mengizinkan semuanya.
    setProp(SDK::CrDeviceProperty_StillImageStoreDestination, SDK::CrStillImageStoreDestination_HostPC, SDK::CrDataType_UInt16);
    return 0;
}

API int sony_connected() {
    if (!g_open || !g_cb) return 0;
    std::lock_guard<std::mutex> l(g_cb->m);
    return g_cb->connected && !g_cb->disconnected ? 1 : 0;
}

API void sony_disconnect() {
    if (g_open) {
        SDK::Disconnect(g_handle);
        SDK::ReleaseDevice(g_handle);
        g_open = false;
    }
    if (g_info) { g_info->Release(); g_info = nullptr; }
    delete g_cb; g_cb = nullptr;
}

// Tembak dan tunggu file masuk ke saveDir. afMs > 0: setengah-tekan dulu supaya autofocus.
// outPath menerima path lengkap file. 0 ok, 2 timeout, <0 error.
API int sony_capture(int afMs, int timeoutMs, wchar_t* outPath, int outCap) {
    if (!g_open) return -1;
    {
        std::lock_guard<std::mutex> l(g_cb->m);
        g_cb->hasDownload = false;
        g_cb->downloaded.clear();
    }
    if (afMs > 0) {
        setProp(SDK::CrDeviceProperty_S1, SDK::CrLockIndicator_Locked, SDK::CrDataType_UInt16);
        std::this_thread::sleep_for(std::chrono::milliseconds(afMs));
    }
    auto e1 = SDK::SendCommand(g_handle, SDK::CrCommandId_Release, SDK::CrCommandParam_Down);
    std::this_thread::sleep_for(35ms);
    SDK::SendCommand(g_handle, SDK::CrCommandId_Release, SDK::CrCommandParam_Up);
    if (afMs > 0) setProp(SDK::CrDeviceProperty_S1, SDK::CrLockIndicator_Unlocked, SDK::CrDataType_UInt16);
    if (CR_FAILED(e1)) return static_cast<int>(e1) ? static_cast<int>(e1) : -2;

    std::unique_lock<std::mutex> l(g_cb->m);
    if (!g_cb->cv.wait_for(l, std::chrono::milliseconds(timeoutMs), [] { return g_cb->hasDownload || g_cb->disconnected; })) return 2;
    if (!g_cb->hasDownload) return -3;
    copyWide(g_cb->downloaded.c_str(), outPath, outCap);
    return 0;
}

API int sony_focus(int afMs) {
    if (!g_open) return -1;
    setProp(SDK::CrDeviceProperty_S1, SDK::CrLockIndicator_Locked, SDK::CrDataType_UInt16);
    std::this_thread::sleep_for(std::chrono::milliseconds(afMs));
    setProp(SDK::CrDeviceProperty_S1, SDK::CrLockIndicator_Unlocked, SDK::CrDataType_UInt16);
    return 0;
}

// 0 = frame diisi (len), 1 = frame belum berubah/belum siap, <0 = error.
API int sony_live_frame(uint8_t* buf, int cap, int* len) {
    if (!g_open) return -1;
    SDK::CrImageInfo info;
    if (CR_FAILED(SDK::GetLiveViewImageInfo(g_handle, &info))) return 1;
    auto need = info.GetBufferSize();
    if (need < 1) return 1;
    if (g_lvBuf.size() < need) g_lvBuf.resize(need);

    SDK::CrImageDataBlock block;
    block.SetSize(need);
    block.SetData(g_lvBuf.data());
    auto err = SDK::GetLiveViewImage(g_handle, &block);
    if (CR_FAILED(err)) return err == SDK::CrWarning_Frame_NotUpdated ? 1 : -2;
    auto n = block.GetImageSize();
    if (n == 0 || static_cast<int>(n) > cap) return 1;
    memcpy(buf, block.GetImageData(), n);
    *len = static_cast<int>(n);
    return 0;
}

// Baca satu properti: nilai sekarang + daftar nilai yang boleh dipilih.
// Return 0 ok, 1 properti tidak ada/ tidak didukung.
API int sony_get_prop(uint32_t code, uint64_t* current, uint64_t* values, int maxValues, int* nValues, int* writable) {
    *nValues = 0; *writable = 0;
    if (!g_open) return -1;
    SDK::CrDeviceProperty* list = nullptr;
    CrInt32 n = 0;
    uint32_t c = code;
    if (CR_FAILED(SDK::GetSelectDeviceProperties(g_handle, 1, &c, &list, &n)) || !list || n < 1) return 1;
    int rc = 1;
    for (CrInt32 i = 0; i < n; ++i) {
        if (list[i].GetCode() != code) continue;
        auto type = list[i].GetValueType();
        auto sz = elemSize(type);
        *current = list[i].GetCurrentValue();
        *writable = list[i].IsSetEnableCurrentValue() ? 1 : 0;
        auto* raw = list[i].GetValues();
        if (sz > 0 && raw) {
            int cnt = static_cast<int>(list[i].GetValueSize() / sz);
            for (int k = 0; k < cnt && k < maxValues; ++k) {
                uint64_t v = 0;
                memcpy(&v, raw + k * sz, sz);
                values[k] = v;
                (*nValues)++;
            }
        }
        rc = 0;
        break;
    }
    SDK::ReleaseDeviceProperties(g_handle, list);
    return rc;
}

// typeBytes: 1/2/4/8 (lebar nilai). Return 0 ok, selain itu kode error SDK.
API int sony_set_prop(uint32_t code, uint64_t value, int typeBytes) {
    if (!g_open) return -1;
    SDK::CrDataType t = typeBytes == 1 ? SDK::CrDataType_UInt8 : typeBytes == 2 ? SDK::CrDataType_UInt16
        : typeBytes == 8 ? SDK::CrDataType_UInt64 : SDK::CrDataType_UInt32;
    SDK::CrDeviceProperty p;
    p.SetCode(code);
    p.SetCurrentValue(value);
    p.SetValueType(t);
    return static_cast<int>(SDK::SetDeviceProperty(g_handle, &p));
}

API uint32_t sony_last_error() { return g_cb ? g_cb->lastError : 0; }

// Konstanta kode properti, supaya C# tidak menyalin angka dari header.
API uint32_t sony_code_fnumber() { return SDK::CrDeviceProperty_FNumber; }
API uint32_t sony_code_shutter() { return SDK::CrDeviceProperty_ShutterSpeed; }
API uint32_t sony_code_iso() { return SDK::CrDeviceProperty_IsoSensitivity; }
API uint32_t sony_code_wb() { return SDK::CrDeviceProperty_WhiteBalance; }
API uint32_t sony_code_exposure_mode() { return SDK::CrDeviceProperty_ExposureProgramMode; }
API uint32_t sony_code_exposure_bias() { return SDK::CrDeviceProperty_ExposureBiasCompensation; }
API uint32_t sony_code_metering() { return SDK::CrDeviceProperty_MeteringMode; }
API uint32_t sony_code_focus_mode() { return SDK::CrDeviceProperty_FocusMode; }
API uint32_t sony_code_focus_area() { return SDK::CrDeviceProperty_FocusArea; }
API uint32_t sony_code_image_size() { return SDK::CrDeviceProperty_ImageSize; }
API uint32_t sony_code_image_quality() { return SDK::CrDeviceProperty_StillImageQuality; }
