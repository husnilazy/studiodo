import { beforeEach, describe, expect, it } from "vitest";
import { useKioskSession } from "./sessionStore";

describe("multi-camera angle bookkeeping", () => {
  beforeEach(() => useKioskSession.getState().resetSession());

  it("single-camera sessions leave angle state empty", () => {
    useKioskSession.getState().setPhotoAtSlot(0, "blob:a");
    const s = useKioskSession.getState();
    expect(s.photoAngles).toEqual({});
    expect(s.altPhotos).toEqual({});
  });

  it("swapAngle puts the other camera's photo in the slot and keeps the old one as the alternate", () => {
    const s = useKioskSession.getState();
    s.setPhotoAtSlot(1, "blob:main");
    s.setPhotoAngle(1, "Utama");
    s.setAltPhoto(1, { url: "blob:side", camera: "Samping" });
    useKioskSession.getState().swapAngle(1);
    let now = useKioskSession.getState();
    expect(now.photoUrls[1]).toBe("blob:side");
    expect(now.photoAngles[1]).toBe("Samping");
    expect(now.altPhotos[1]).toEqual({ url: "blob:main", camera: "Utama" });
    useKioskSession.getState().swapAngle(1);
    now = useKioskSession.getState();
    expect(now.photoUrls[1]).toBe("blob:main");
    expect(now.photoAngles[1]).toBe("Utama");
  });

  it("swapAngle without an alternate does nothing, and reset clears angles", () => {
    const s = useKioskSession.getState();
    s.setPhotoAtSlot(0, "blob:a");
    s.swapAngle(0);
    expect(useKioskSession.getState().photoUrls[0]).toBe("blob:a");
    s.setPhotoAngle(0, "Utama");
    s.setAltPhoto(0, { url: "blob:b", camera: "X" });
    useKioskSession.getState().resetSession();
    expect(useKioskSession.getState().altPhotos).toEqual({});
    expect(useKioskSession.getState().photoAngles).toEqual({});
  });
});
