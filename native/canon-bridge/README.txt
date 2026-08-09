STUDIODO Canon bridge runtime

Place the legally licensed, compiled Canon EDSDK bridge here before building:

  canon-bridge.exe
  CanonEDSDK.dll (or the DLL name required by the bridge)
  EDSDK.dll (if required by the bridge)

The bridge must listen on http://127.0.0.1:5513 and implement:

  GET  /health
  POST /capture

POST /capture receives JSON:
  { "slotIndex": 0, "filter": "normal", "orientation": "portrait" }

It may return image/jpeg directly, or JSON:
  { "dataUrl": "data:image/jpeg;base64,..." }
  { "imageUrl": "http://127.0.0.1:5513/..." }

Canon EDSDK is proprietary and is intentionally not included in this repository.
Obtain the SDK and redistribution permissions from Canon, then compile the
bridge against the SDK and place its runtime files in this folder.
