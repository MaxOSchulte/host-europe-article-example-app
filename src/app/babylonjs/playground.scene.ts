import {
  ActionManager,
  ArcRotateCamera,
  Color3,
  Color4,
  CombineAction,
  DynamicTexture,
  ExecuteCodeAction,
  HemisphericLight,
  InterpolateValueAction,
  Mesh,
  MeshBuilder,
  Nullable,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { Observer } from '@babylonjs/core/Misc/observable';
import { GridMaterial } from '@babylonjs/materials';
import { ReplaySubject, Subject } from 'rxjs';

export class MyScene extends Scene {
  private sunLight?: PointLight;
  private renderHookObserver?: Nullable<Observer<any>>;
  private meshAddClickObserver?: Nullable<Observer<any>>;

  availableMeshes = new ReplaySubject<string[]>(1);
  clicked = new Subject<string>();

  setup(): void {
    this.meshAddClickObserver = this.onNewMeshAddedObservable.add(() => {
      this.availableMeshes.next(this.meshes.filter(({name}) => name.startsWith('my')).map(({name}) => name));
    });

    this.clearColor = Color4.FromColor3(Color3.White()); // Hintergrundfarbe
    this.createDefaultContent();
    this.createSoloarSystem();
    this.setupBeforeRenderHook();

  }

  addClickHandler(mesh: Mesh): void {
    mesh.isPickable = true;
    mesh.actionManager = new ActionManager(this);

    // Actions sequenziell ausführen
    mesh.actionManager.registerAction(new InterpolateValueAction(
      ActionManager.OnPickTrigger,
      mesh,
      'position.y',
      10,
      333,
    ))?.then(new InterpolateValueAction(
      ActionManager.OnPickTrigger,
      mesh,
      'position.y', 0,
      333,
    ));

    // Actions parallel ausführen
    mesh.actionManager.registerAction(
      new CombineAction(
        ActionManager.OnPickTrigger,
        [
          new ExecuteCodeAction(ActionManager.NothingTrigger, () => this.clicked.next(mesh.name)),
        ],
        // weitere Action hinzufügen
      ),
    );
  }

  dispose(): void {
    if (this.renderHookObserver) {
      this.renderHookObserver.unregisterOnNextCall = true;
    }
    if (this.meshAddClickObserver) {
      this.meshAddClickObserver.unregisterOnNextCall = true;
    }
    super.dispose();
    this.availableMeshes.complete();
  }

  toggleClearColor(): void {
    const gray = Color3.Gray();
    const white = Color3.White();

    // cast to specific material and remove nullable
    // dieses Material ist in dieser klasse immer vorhanden
    const grid: GridMaterial = this.getMaterialByName('gridMat') as GridMaterial;

    const nextColor = grid.mainColor.equals(gray) ? white : gray;

    grid.mainColor = nextColor;
    this.clearColor = Color4.FromColor3(nextColor);
  }

  private createDefaultContent(): void {
    // Erzeugen einer Camera
    const camera = new ArcRotateCamera('camera', 0, 0, 0, new Vector3(5, 3, 0), this);
    camera.setPosition(new Vector3(10.253, 5.82251, -9.45717));
    const canvas = this.getEngine().getRenderingCanvas();
    camera.attachControl(canvas, true); // Maus und Tastatur interaktion mit der Camera Position

    // Erzeugen der Beleuchtung
    // Generelle Beleuchtung
    // "Deckenbeleuchtung" / Hemispherische Beleuchtung - scheint überall gleichmäßig in die selbe Richtung
    const hemisphereLight = new HemisphericLight('hemisphericlight', new Vector3(1, 0.5, 0), this);
    hemisphereLight.intensity = 0.2;

    // Licht der Sonne (Glühbirne) - scheint von einem Punkt aus in alle Richtungen
    this.sunLight = new PointLight('sunlight', Vector3.Zero(), this);
    this.sunLight.intensity = 1;

    // Erstellen des "Boden" Grids
    const plane = MeshBuilder.CreatePlane('floor', {width: 1000, height: 1000}, this);
    plane.position.y -= 8;
    plane.rotation.x = Math.PI / 2;

    // Erzeugen und zuweisen eines vorgefertigten Materials
    const gridMat = new GridMaterial('gridMat', this);
    gridMat.mainColor = Color3.White();
    plane.material = gridMat;
  }

  private createSoloarSystem(): void {
    const rootNode = new TransformNode('root', this); // Leeres "Game Object"

    // Erstellen der Sonne
    const sun = MeshBuilder.CreateSphere('mySun', {diameter: 7}, this);
    sun.parent = rootNode; // Parent-Child Hierarchie / Scene-Graph
    const sunMat = new StandardMaterial('sunmat', this);
    sunMat.emissiveColor = new Color3(1, .6, 0);
    sun.material = sunMat; // Material der Sonne zuweise
    this.displayAxis(10, sun);
    this.addClickHandler(sun);

    // Erstellen der Erde
    const earth = MeshBuilder.CreateSphere('myEarth', {diameter: 2}, this);
    earth.parent = rootNode; // Parent-Child Hierarchie / Scene-Graph
    // Platziere die Erde mit Abstand zur Sonne
    earth.position.x += 13;
    earth.position.z += 13;
    this.displayAxis(4, earth);

    // Erzeugt ein einfaches Material mit einer Farbe
    const earthMat = new StandardMaterial('earthmat', this);
    earthMat.diffuseColor = new Color3(0.7, 0.64, 1);
    earth.material = earthMat; // Parent-Child Hierarchie / Scene-Graph
    this.addClickHandler(earth);

    // Erzeugt den Mond
    const moon = MeshBuilder.CreateSphere('myMoon', {diameter: .6}, this);
    moon.parent = earth;
    // Platziere den Mond mit Abstand zur Erde
    moon.position.x += 3;
    moon.position.z += 3;
    this.displayAxis(.7, moon);
    this.addClickHandler(moon);

    if (this.sunLight) {
      // Wurfschatten hinzufügen
      // Erstelle ein Object zur Schattenberechnung aufgrund einer Lichtquelle und regestriere Erde und mond
      const shadowCaster = new ShadowGenerator(1024, this.sunLight);
      shadowCaster.addShadowCaster(earth);
      shadowCaster.addShadowCaster(moon);
      // Erde und Mond sollen Schatten "empfangen" können
      earth.receiveShadows = true;
      moon.receiveShadows = true;
    }
  }

  /**
   * method based on https://doc.babylonjs.com/toolsAndResources/utilities/World_Axes
   */
  private displayAxis(size: number, parent: TransformNode): void {
    const makeTextPlane = (text: string, color: string, textSize: number) => {
      const dynamicTexture = new DynamicTexture('DynamicTexture', 50, this, true);
      dynamicTexture.hasAlpha = true;
      dynamicTexture.drawText(text, 5, 40, 'bold 36px Arial', color, 'transparent', true);
      const plane = Mesh.CreatePlane('TextPlane', textSize, this, true);
      const planeMat = new StandardMaterial('TextPlaneMaterial', this);
      planeMat.backFaceCulling = false;
      planeMat.specularColor = new Color3(0, 0, 0);
      planeMat.diffuseTexture = dynamicTexture;
      plane.material = planeMat;
      return plane;
    };

    const axisX = Mesh.CreateLines('axisX', [
      Vector3.Zero(), new Vector3(size, 0, 0), new Vector3(size * 0.95, 0.05 * size, 0),
      new Vector3(size, 0, 0), new Vector3(size * 0.95, -0.05 * size, 0),
    ], this);
    axisX.color = new Color3(1, .5, .5);
    const xChar = makeTextPlane('X', 'red', size / 5);
    xChar.position = new Vector3(0.9 * size, -0.05 * size, 0);
    const axisY = Mesh.CreateLines('axisY', [
      Vector3.Zero(), new Vector3(0, size, 0), new Vector3(-0.05 * size, size * 0.95, 0),
      new Vector3(0, size, 0), new Vector3(0.05 * size, size * 0.95, 0),
    ], this);
    axisY.color = new Color3(.5, 1, .5);
    const yChar = makeTextPlane('Y', 'green', size / 5);
    yChar.position = new Vector3(0, 0.9 * size, -0.05 * size);
    const axisZ = Mesh.CreateLines('axisZ', [
      Vector3.Zero(), new Vector3(0, 0, size), new Vector3(0, -0.05 * size, size * 0.95),
      new Vector3(0, 0, size), new Vector3(0, 0.05 * size, size * 0.95),
    ], this);
    axisZ.color = new Color3(.5, .5, 1);
    const zChar = makeTextPlane('Z', 'blue', size / 5);
    zChar.position = new Vector3(0, 0.05 * size, 0.9 * size);

    xChar.parent = parent;
    yChar.parent = parent;
    zChar.parent = parent;

    axisX.parent = parent;
    axisY.parent = parent;
    axisZ.parent = parent;
  }

  private setupBeforeRenderHook(): void {
    this.renderHookObserver = this.onBeforeRenderObservable.add(() => {
      // Benutzte die getter der Szene zu Demonstrationszwecken
      // Passe die Rotationen der einzelnen Elemente an (Radianten)
      const root = this.getTransformNodeByName('root') as Mesh;
      if (root) {
        root.rotation.y += 0.005;
      }
      const sun = this.getMeshByName('sun');
      if (sun) {
        sun.rotation.y -= 0.004;
      }
      const earth = this.getMeshByName('earth');
      if (earth) {
        earth.rotation.y += 0.02;
      }
    });
  }

  highlight(name: string): void {
    const mesh = this.getMeshByName(name) as Mesh;
    mesh.renderOutline = true;
    mesh.outlineWidth = .1;
    mesh.outlineColor = Color3.Blue();
    setTimeout(() => mesh.renderOutline = false, 1000);
  }
}
