export interface GraphNode {
  id: string;
  title: string;
  category: string;
  connections: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const CATEGORY_COLORS: Record<string, string> = {
  entities: '#00f3ff',
  concepts: '#00ff9f',
  lessons: '#ff00cc',
  decisions: '#ffcc00',
  milestones: '#ff6600',
  reflections: '#aa66ff',
  research: '#ff4444',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || '#ffffff';
}

export function getAllCategories(): string[] {
  return Object.keys(CATEGORY_COLORS);
}

export function computeLayout(
  pages: Array<{ name: string; title: string; category: string; links: string[] }>,
  iterations: number = 200
): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const uniqueLinks = new Set<string>();

  pages.forEach((page, idx) => {
    const connections = new Set(page.links).size;
    const angle = (idx / pages.length) * Math.PI * 2;
    const radius = 15;

    nodeMap.set(page.name, {
      id: page.name,
      title: page.title,
      category: page.category,
      connections,
      x: Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
      y: Math.sin(angle) * radius + (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 10,
      vx: 0,
      vy: 0,
      vz: 0,
    });
  });

  pages.forEach((page) => {
    page.links.forEach((target) => {
      if (nodeMap.has(target)) {
        const key = [page.name, target].sort().join('->');
        if (!uniqueLinks.has(key)) {
          uniqueLinks.add(key);
          links.push({ source: page.name, target });
        }
      }
    });
  });

  const nodes = Array.from(nodeMap.values());

  for (let i = 0; i < iterations; i++) {
    nodes.forEach((node) => {
      node.vx = 0;
      node.vy = 0;
      node.vz = 0;
    });

    nodes.forEach((nodeA) => {
      nodes.forEach((nodeB) => {
        if (nodeA.id === nodeB.id) return;
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dz = nodeA.z - nodeB.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const force = 100 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        nodeA.vx += fx;
        nodeA.vy += fy;
        nodeA.vz += fz;
      });
    });

    links.forEach((link) => {
      const nodeA = nodeMap.get(link.source);
      const nodeB = nodeMap.get(link.target);
      if (!nodeA || !nodeB) return;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dz = nodeB.z - nodeA.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const force = (dist - 8) * 0.05;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      nodeA.vx += fx;
      nodeA.vy += fy;
      nodeA.vz += fz;
      nodeB.vx -= fx;
      nodeB.vy -= fy;
      nodeB.vz -= fz;
    });

    const damping = 0.85;
    nodes.forEach((node) => {
      node.x += node.vx * damping;
      node.y += node.vy * damping;
      node.z += node.vz * damping;
    });
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  nodes.forEach(node => {
    node.x -= centerX;
    node.y -= centerY;
  });

  return { nodes, links };
}