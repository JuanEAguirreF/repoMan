import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type HeroItem = {
  id: string;
  label: string;
  imageUrl: string;
  href: string;
};

type Props = {
  items: HeroItem[];
  badge: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
};

type HoverState = {
  label: string;
  x: number;
  y: number;
} | null;

export function SpiralHero({
  items,
  badge,
  title,
  description,
  ctaLabel,
  ctaHref,
  ctaSecondaryLabel,
  ctaSecondaryHref
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<HoverState>(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    renderer.setClearColor(0x000000, 0);

    const group = new THREE.Group();
    scene.add(group);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    const meshes: THREE.Mesh[] = [];
    const plane = new THREE.PlaneGeometry(1.41, 2);

    items.forEach((item, index) => {
      const texture = loader.load(item.imageUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      const mesh = new THREE.Mesh(plane, material);

      const angle = index * 0.72;
      const radius = 2.7;
      const y = (index - (items.length - 1) / 2) * 0.28;

      mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      mesh.rotation.y = -angle + Math.PI / 2;
      mesh.userData = { label: item.label, href: item.href };

      group.add(mesh);
      meshes.push(mesh);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-2, -2);

    let targetX = 0;
    let targetY = 0;
    let scrollVelocity = 0;
    let rafId = 0;
    let baseGroupOffsetX = 0;
    let hoveredMesh: THREE.Object3D | null = null;

    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      baseGroupOffsetX = width >= 1180 ? 4.4 : width >= 980 ? 3.6 : width >= 760 ? 2.25 : 0.9;
      group.position.x = baseGroupOffsetX;
    }

    function updatePointer(event: MouseEvent) {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.set(x, y);
      targetX = x;
      targetY = y;
    }

    function onMouseMove(event: MouseEvent) {
      updatePointer(event);
    }

    function onMouseLeave() {
      pointer.set(-2, -2);
      targetX = 0;
      targetY = 0;
      setHover(null);
      container.style.cursor = "default";
    }

    function onWheel(event: WheelEvent) {
      scrollVelocity += event.deltaY * 0.00005;
    }

    function onClick() {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes)[0];
      if (!hit) return;
      const href = hit.object.userData.href as string;
      if (href) window.location.href = href;
    }

    let lastHoverLabel = "";

    function animate() {
      const shouldPauseRotation = hoveredMesh !== null;
      if (!shouldPauseRotation) {
        group.rotation.y += 0.0016 + scrollVelocity;
      }
      scrollVelocity *= 0.9;

      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetY * 0.045, 0.05);
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -targetX * 0.035, 0.05);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX * 0.1, 0.05);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY * 0.14, 0.05);

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes)[0];
      if (hit) {
        hoveredMesh = hit.object;
        container.style.cursor = "pointer";
        const projected = hit.point.clone().project(camera);
        const x = ((projected.x + 1) / 2) * container.clientWidth;
        const y = ((-projected.y + 1) / 2) * container.clientHeight - 14;
        const label = String(hit.object.userData.label);
        if (label !== lastHoverLabel) {
          lastHoverLabel = label;
          setHover({ label, x, y });
        } else {
          setHover((prev) => (prev ? { ...prev, x, y } : { label, x, y }));
        }
      } else if (lastHoverLabel) {
        hoveredMesh = null;
        container.style.cursor = "default";
        lastHoverLabel = "";
        setHover(null);
      } else {
        hoveredMesh = null;
        container.style.cursor = "default";
      }

      meshes.forEach((mesh) => {
        const isHovered = hoveredMesh === mesh;
        const targetScale = isHovered ? 1.045 : 1;
        mesh.scale.x = THREE.MathUtils.lerp(mesh.scale.x, targetScale, 0.12);
        mesh.scale.y = THREE.MathUtils.lerp(mesh.scale.y, targetScale, 0.12);
      });

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    }

    resize();
    rafId = requestAnimationFrame(animate);

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);
    container.addEventListener("wheel", onWheel, { passive: true });
    canvas.addEventListener("click", onClick);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      container.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      container.style.cursor = "default";

      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      renderer.dispose();
    };
  }, [items]);

  return (
    <div ref={containerRef} className="spiral-canvas-wrap">
      <canvas ref={canvasRef} className="spiral-canvas" />
      <div className="hero-overlay">
        <span className="mini-pill">{badge}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="hero-cta-row">
          {ctaSecondaryLabel && ctaSecondaryHref && (
            <a className="hero-cta ghost" href={ctaSecondaryHref}>
              {ctaSecondaryLabel}
            </a>
          )}
          <a className="hero-cta" href={ctaHref}>
            {ctaLabel}
          </a>
        </div>
      </div>
      {hover && (
        <div className="spiral-tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.label}
        </div>
      )}
    </div>
  );
}
