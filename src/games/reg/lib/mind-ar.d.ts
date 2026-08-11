/**
 * mind-ar ships no type declarations. This shim covers exactly the surface the
 * scene module uses — nothing more, so drift from the real API stays visible.
 */
declare module "mind-ar/dist/mindar-face-three.prod.js" {
  import type { Camera, Group, Scene, WebGLRenderer } from "three";

  export interface MindARFaceAnchor {
    group: Group;
    onTargetFound?: () => void;
    onTargetLost?: () => void;
  }

  export class MindARThree {
    constructor(options: {
      container: HTMLElement;
      /** "yes" (default) builds MindAR's own overlay, "no" builds none, anything else
       *  is treated as a selector for an existing element. We pass "no" — see the
       *  comment at the construction site. */
      uiLoading?: "yes" | "no" | string;
      uiScanning?: "yes" | "no" | string;
      uiError?: "yes" | "no" | string;
      filterMinCF?: number | null;
      filterBeta?: number | null;
      userDeviceId?: string | null;
      environmentDeviceId?: string | null;
      disableFaceMirror?: boolean;
    });
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
    /** The webcam element MindAR injects. Nulled in our stop() to neuter the
     *  library's un-removable resize listener — hence `| null`. */
    video: HTMLVideoElement | null;
    addAnchor(anchorIndex: number): MindARFaceAnchor;
    start(): Promise<void>;
    stop(): void;
  }
}
