declare module 'three/examples/jsm/loaders/FBXLoader.js' {
  import { Group, LoadingManager, Loader } from 'three';

  export class FBXLoader extends Loader {
    constructor(manager?: LoadingManager);
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<Group>;
  }
}

declare module 'three/examples/jsm/loaders/TGALoader.js' {
  import { DataTexture, DataTextureLoader, LoadingManager } from 'three';

  export class TGALoader extends DataTextureLoader {
    constructor(manager?: LoadingManager);
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<DataTexture>;
  }
}
