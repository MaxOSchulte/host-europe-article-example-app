import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Engine } from '@babylonjs/core';
import { fromEvent, Observable, Subscription } from 'rxjs';
import { debounceTime, map, scan } from 'rxjs/operators';
import { MyScene } from './babylonjs/playground.scene';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  clicks?: Observable<[string, number][]>;
  meshes?: Observable<string[]>;

  @ViewChild('canvas', {static: true}) private canvas?: ElementRef<HTMLCanvasElement>;
  private engine?: Engine;
  private scene?: MyScene;
  private windowResizeSubscription: Subscription = Subscription.EMPTY;

  constructor(private readonly ngZone: NgZone) {
  }

  ngAfterViewInit(): void {
    if (this.canvas) {
      this.engine = new Engine(this.canvas.nativeElement);
      this.scene = new MyScene(this.engine);
      this.scene.setup();

      this.clicks = this.scene.clicked.pipe(
        scan((acc: { [key: string]: number }, value: string) => {
          const summed = acc[value] || 0;
          return {...acc, [value]: summed + 1};
        }, {}),
        map(value => Object.entries(value)));

      this.ngZone.runOutsideAngular(() => this.engine?.runRenderLoop(() => this.scene?.render()));

      this.windowResizeSubscription = fromEvent(window, 'resize').pipe(
        debounceTime(10),
      ).subscribe(() => this.engine?.resize());

      this.meshes = this.scene.availableMeshes;
    }
  }

  ngOnDestroy(): void {
    this.windowResizeSubscription.unsubscribe();
    this.ngZone.runOutsideAngular(() => this.engine?.stopRenderLoop(() => this.scene?.render()));
    this.scene?.dispose();
    this.engine?.dispose();
  }

  toggleBackground(): void {
    this.scene?.toggleClearColor();
  }

  highlight(mesh: string): void {
    this.scene?.highlight(mesh);
  }
}
