import { Component, createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import * as BABYLON from 'babylonjs';
import { computeLayout, getCategoryColor, type GraphData, type GraphNode } from '../lib/graph-layout';

interface WikiGraph3DProps {
  wikiData: any;
  onNodeClick: (page: any) => void;
  searchQuery: string;
  visibleCategories: Set<string>;
}

const WikiGraph3D: Component<WikiGraph3DProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let engine: BABYLON.Engine | null = null;
  let scene: BABYLON.Scene | null = null;
  let camera: BABYLON.ArcRotateCamera | null = null;
  
  const [hoveredNode, setHoveredNode] = createSignal<string | null>(null);
  const nodeMeshes = new Map<string, BABYLON.Mesh>();
  const linkLines = new Map<string, BABYLON.LinesMesh>();
  
  let currentGraphData: GraphData | null = null;
  let nodeMap: Map<string, GraphNode> = new Map();
  let highlightMaterial: BABYLON.StandardMaterial | null = null;
  let dimMaterial: BABYLON.StandardMaterial | null = null;
  let glowLayer: BABYLON.GlowLayer | null = null;

  const createMaterials = (scene: BABYLON.Scene) => {
    highlightMaterial = new BABYLON.StandardMaterial('highlight', scene);
    highlightMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
    highlightMaterial.disableLighting = true;
    
    dimMaterial = new BABYLON.StandardMaterial('dim', scene);
    dimMaterial.alpha = 0.3;
    dimMaterial.disableLighting = true;
  };

  const createNodeMesh = (
    scene: BABYLON.Scene,
    node: GraphNode,
    color: string,
    size: number
  ): BABYLON.Mesh => {
    const sphere = BABYLON.MeshBuilder.CreateSphere(node.id, { diameter: size }, scene);
    sphere.position = new BABYLON.Vector3(node.x, node.y, node.z);
    
    const mat = new BABYLON.StandardMaterial(`mat-${node.id}`, scene);
    const rgb = hexToRgb(color);
    if (rgb) {
      mat.emissiveColor = new BABYLON.Color3(rgb.r / 255, rgb.g / 255, rgb.b / 255);
      mat.diffuseColor = new BABYLON.Color3(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    }
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    sphere.material = mat;
    
    return sphere;
  };

  const createLinkLine = (
    scene: BABYLON.Scene,
    sourceNode: GraphNode,
    targetNode: GraphNode,
    color: string
  ): BABYLON.LinesMesh => {
    const points = [
      new BABYLON.Vector3(sourceNode.x, sourceNode.y, sourceNode.z),
      new BABYLON.Vector3(targetNode.x, targetNode.y, targetNode.z),
    ];
    
    const line = BABYLON.MeshBuilder.CreateLines(`link-${sourceNode.id}-${targetNode.id}`, {
      points,
    }, scene);
    
    const rgb = hexToRgb(color);
    if (rgb) {
      line.color = new BABYLON.Color3(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    }
    
    return line;
  };

  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  };

  const buildGraph = () => {
    if (!scene || !props.wikiData) return;

    nodeMeshes.forEach(mesh => mesh.dispose());
    linkLines.forEach(line => line.dispose());
    nodeMeshes.clear();
    linkLines.clear();

    const graphData = computeLayout(props.wikiData.pages);
    currentGraphData = graphData;
    nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));

    graphData.links.forEach(link => {
      const sourceNode = nodeMap.get(link.source);
      const targetNode = nodeMap.get(link.target);
      
      if (sourceNode && targetNode) {
        const line = createLinkLine(scene, sourceNode, targetNode, '#00f3ff');
        linkLines.set(`${link.source}->${link.target}`, line);
      }
    });

    const maxConnections = Math.max(...graphData.nodes.map(n => n.connections), 1);
    
    graphData.nodes.forEach(node => {
      const color = getCategoryColor(node.category);
      const size = 1 + (node.connections / maxConnections) * 2;
      
      const mesh = createNodeMesh(scene, node, color, size);
      mesh.actionManager = new BABYLON.ActionManager(scene);
      
      mesh.actionManager.registerAction(
        new BABYLON.ExecuteCodeAction(
          BABYLON.ActionManager.OnPickTrigger,
          () => {
            const page = props.wikiData.pages.find((p: any) => p.name === node.id);
            if (page) props.onNodeClick(page);
          }
        )
      );

      mesh.actionManager.registerAction(
        new BABYLON.ExecuteCodeAction(
          BABYLON.ActionManager.OnPointerOverTrigger,
          () => {
            setHoveredNode(node.id);
          }
        )
      );

      mesh.actionManager.registerAction(
        new BABYLON.ExecuteCodeAction(
          BABYLON.ActionManager.OnPointerOutTrigger,
          () => {
            setHoveredNode(null);
          }
        )
      );

      nodeMeshes.set(node.id, mesh);
    });

    glowLayer?.dispose();
    glowLayer = new BABYLON.GlowLayer('glow', scene, {
      mainTextureFixedSize: 512,
      blurKernelSize: 64,
    });
    glowLayer.intensity = 0.8;
    
    nodeMeshes.forEach(mesh => {
      if (mesh.material) glowLayer?.addIncludedOnlyMesh(mesh);
    });
    linkLines.forEach(line => {
      glowLayer?.addIncludedOnlyMesh(line);
    });

    camera?.setPosition(new BABYLON.Vector3(0, 0, -50));
    camera?.setTarget(BABYLON.Vector3.Zero());
  };

  const animateToNode = (nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node || !camera) return;

    const targetPos = new BABYLON.Vector3(node.x, node.y, node.z);
    
    const animation = new BABYLON.Animation(
      'cameraMove',
      'target',
      60,
      BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    animation.setKeys([
      { frame: 0, value: camera.target.clone() },
      { frame: 30, value: targetPos },
    ]);

    const easingFunction = new BABYLON.CubicEase();
    easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    animation.setEasingFunction(easingFunction);

    camera.animations.push(animation);
    scene?.beginAnimation(camera, 0, 30, false);

    const radiusAnimation = new BABYLON.Animation(
      'cameraRadius',
      'radius',
      60,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    radiusAnimation.setKeys([
      { frame: 0, value: camera.radius },
      { frame: 30, value: 15 },
    ]);
    radiusAnimation.setEasingFunction(easingFunction);

    camera.animations.push(radiusAnimation);
    scene?.beginAnimation(camera, 0, 30, false);
  };

  createEffect(() => {
    const query = props.searchQuery.toLowerCase();
    const visibleCats = props.visibleCategories;
    
    if (!scene || !currentGraphData) return;

    nodeMeshes.forEach((mesh, nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      const matchesSearch = !query || node.title.toLowerCase().includes(query) || nodeId.includes(query);
      const matchesCategory = visibleCats.has(node.category);

      if (!matchesSearch || !matchesCategory) {
        if (mesh.material) {
          mesh.material.alpha = 0.2;
        }
      } else {
        if (mesh.material) {
          mesh.material.alpha = 1;
        }
      }
    });

    linkLines.forEach((line, linkKey) => {
      const [source, target] = linkKey.split('->');
      const sourceMatches = (() => {
        const node = nodeMap.get(source);
        if (!node) return false;
        const matchesSearch = !query || node.title.toLowerCase().includes(query) || source.includes(query);
        const matchesCategory = visibleCats.has(node.category);
        return matchesSearch && matchesCategory;
      })();

      const targetMatches = (() => {
        const node = nodeMap.get(target);
        if (!node) return false;
        const matchesSearch = !query || node.title.toLowerCase().includes(query) || target.includes(query);
        const matchesCategory = visibleCats.has(node.category);
        return matchesSearch && matchesCategory;
      })();

      if (sourceMatches && targetMatches) {
        line.visibility = 1;
      } else {
        line.visibility = 0.1;
      }
    });
  });

  onMount(() => {
    if (!canvasRef) return;

    try {
      engine = new BABYLON.Engine(canvasRef, true, { preserveDrawingBuffer: true, stencil: true });
    } catch (e) {
      console.warn('BabylonJS engine failed to initialize (WebGL not available):', e);
      return;
    }
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.04, 0.04, 0.06, 1);

    camera = new BABYLON.ArcRotateCamera('camera', 0, Math.PI / 3, 50, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvasRef, true);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 100;
    camera.wheelPrecision = 20;
    camera.panningSensibility = 100;

    const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.5;

    createMaterials(scene);
    buildGraph();

    engine.runRenderLoop(() => {
      scene?.render();
    });

    const handleResize = () => {
      engine?.resize();
    };
    window.addEventListener('resize', handleResize);

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      engine?.dispose();
    });
  });

  createEffect(() => {
    if (props.wikiData) {
      buildGraph();
    }
  });

  return (
    <div class="relative w-full h-full">
      <canvas
        ref={canvasRef}
        class="w-full h-full rounded-lg"
        style={{ "min-height": "500px" }}
      />
      
      {hoveredNode() && currentGraphData && (() => {
        const node = nodeMap.get(hoveredNode()!)!;
        const color = getCategoryColor(node.category);
        const page = props.wikiData?.pages?.find((p: any) => p.name === node.id);
        return (
          <div
            class="absolute top-4 left-4 px-3 py-2 rounded font-mono pointer-events-none"
            style={{
              background: 'rgba(8, 8, 12, 0.95)',
              border: `1px solid ${color}60`,
              'box-shadow': `0 0 15px ${color}30`,
            }}
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2 h-2 rounded-full" style={{ background: color }} />
              <span class="text-sm font-bold" style={{ color }}>{node.title}</span>
            </div>
            <div class="text-[9px] opacity-40 flex gap-3">
              <span>{node.category}</span>
              <span>{node.connections} connections</span>
              {page && <span>{page.wordCount} words</span>}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default WikiGraph3D;