/**
 * AlpenDrop Flight HUD & Glass Cockpit Telemetry
 * Synchronized screen-space 3D navigation arrow, panoramic Skyrim-style top compass tape,
 * cardinal compass ring, glowing animated minimap radar, and atmospheric wind current alerts.
 */

import * as THREE from 'three';
import type { FlightTelemetry } from '../flight/types.js';
import type { CareerStore } from '../agency/career-store.js';
import type { DeliveryOrder } from '../agency/orders.js';

const _vTarget3D = new THREE.Vector3();
const _vCamSpace = new THREE.Vector3();

export class FlightHUD {
  // DOM Elements
  private elFrancs!: HTMLElement;
  private elStamps!: HTMLElement;
  private elCompassHeading!: HTMLElement;
  private elWaypointInfo!: HTMLElement;
  private elSpeed!: HTMLElement;
  private elAlt!: HTMLElement;
  private elThrottleFill!: HTMLElement;
  private elBattery!: HTMLElement;
  private elDevAssistBtn!: HTMLElement;
  private elMagnetBtn!: HTMLElement;
  private elCameraBtn!: HTMLElement;
  private elTicketContainer!: HTMLElement;
  private elTicketTitle!: HTMLElement;
  private elTicketRecipient!: HTMLElement;
  private elTicketTimer!: HTMLElement;
  private elHealthFill!: HTMLElement;
  private elHealthText!: HTMLElement;

  private elQuestBanner!: HTMLElement;
  private elQuestStepText!: HTMLElement;
  private elQuestSubtext!: HTMLElement;

  private elNavArrowContainer: HTMLElement | null = null;
  private elNavArrowIcon: HTMLElement | null = null;
  private elNavDistance: HTMLElement | null = null;

  // Mini-Map
  private radarCanvas!: HTMLCanvasElement;
  private radarCtx!: CanvasRenderingContext2D;

  // Panoramic Top Compass Tape
  private tapeCanvas!: HTMLCanvasElement;
  private tapeCtx!: CanvasRenderingContext2D;

  init(
    career: CareerStore,
    onOpenJobBoard: () => void,
    onOpenHangar: () => void,
    onToggleDevAssist: () => void,
    onToggleMagnet: () => void,
    onToggleCamera: () => void
  ): void {
    this.elFrancs = document.getElementById('hud-francs')!;
    this.elStamps = document.getElementById('hud-stamps')!;
    this.elCompassHeading = document.getElementById('compass-heading')!;
    this.elWaypointInfo = document.getElementById('waypoint-info')!;
    this.elSpeed = document.getElementById('gauge-speed')!;
    this.elAlt = document.getElementById('gauge-alt')!;
    this.elThrottleFill = document.getElementById('throttle-fill')!;
    this.elBattery = document.getElementById('gauge-battery')!;
    this.elDevAssistBtn = document.getElementById('btn-dev-assist')!;
    this.elMagnetBtn = document.getElementById('btn-magnet')!;
    this.elCameraBtn = document.getElementById('btn-camera')!;
    this.elTicketContainer = document.getElementById('postage-ticket')!;
    this.elTicketTitle = document.getElementById('ticket-title')!;
    this.elTicketRecipient = document.getElementById('ticket-recipient')!;
    this.elTicketTimer = document.getElementById('ticket-timer')!;
    this.elHealthFill = document.getElementById('health-fill')!;
    this.elHealthText = document.getElementById('health-text')!;

    this.elQuestBanner = document.getElementById('quest-banner')!;
    this.elQuestStepText = document.getElementById('quest-step-text')!;
    this.elQuestSubtext = document.getElementById('quest-subtext')!;

    this.elNavArrowContainer = document.getElementById('nav-arrow-container');
    this.elNavArrowIcon = document.getElementById('nav-arrow-icon');
    this.elNavDistance = document.getElementById('nav-distance');

    this.radarCanvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
    if (this.radarCanvas) {
      this.radarCtx = this.radarCanvas.getContext('2d')!;
    }

    this.tapeCanvas = document.getElementById('compass-tape-canvas') as HTMLCanvasElement;
    if (this.tapeCanvas) {
      this.tapeCtx = this.tapeCanvas.getContext('2d')!;
    }

    document.getElementById('btn-open-jobs')?.addEventListener('click', onOpenJobBoard);
    document.getElementById('btn-open-hangar')?.addEventListener('click', onOpenHangar);
    this.elDevAssistBtn?.addEventListener('click', onToggleDevAssist);
    this.elMagnetBtn?.addEventListener('click', onToggleMagnet);
    this.elCameraBtn?.addEventListener('click', onToggleCamera);

    career.subscribe(() => {
      this.updateCareerStats(career);
    });
    this.updateCareerStats(career);
  }

  private updateCareerStats(career: CareerStore): void {
    if (this.elFrancs) this.elFrancs.textContent = `${career.francBalance} ₣`;
    if (this.elStamps) this.elStamps.textContent = `★ ${career.trustStamps}`;
  }

  update(
    telemetry: FlightTelemetry,
    playerPos: { x: number; y: number; z: number },
    activeOrder: DeliveryOrder | null,
    parcelEntity: any | null,
    orderTimeRemainingSeconds: number,
    camera?: THREE.Camera
  ): void {
    // 1. Gauges
    if (this.elSpeed) this.elSpeed.textContent = `${Math.round(telemetry.speedKmh)}`;
    if (this.elAlt) this.elAlt.textContent = `${Math.max(0, Math.round(telemetry.altitudeM))}m`;
    if (this.elBattery) this.elBattery.textContent = `${Math.round(telemetry.batteryPercent)}%`;
    if (this.elThrottleFill) {
      this.elThrottleFill.style.width = `${Math.round(telemetry.throttlePercent * 100)}%`;
    }

    // 2. Dev Assist Toggle Pill
    if (this.elDevAssistBtn) {
      if (telemetry.devAssistsEnabled) {
        this.elDevAssistBtn.textContent = '🧭 Dev Assist: ON';
        this.elDevAssistBtn.className = 'hud-pill interactive active';
      } else {
        this.elDevAssistBtn.textContent = '⚡ Slop Physics: RAW';
        this.elDevAssistBtn.className = 'hud-pill interactive';
      }
    }

    // 3. Magnetic Sling Status Pill
    if (this.elMagnetBtn) {
      if (telemetry.hasCargoAttached) {
        this.elMagnetBtn.textContent = '🧲 Sling: LATCHED (F to Drop)';
        this.elMagnetBtn.className = 'hud-pill interactive active';
      } else if (telemetry.magneticLatchArmed) {
        this.elMagnetBtn.textContent = '🧲 Sling: ARMED (F)';
        this.elMagnetBtn.className = 'hud-pill interactive';
      } else {
        this.elMagnetBtn.textContent = '🧲 Sling: OFF (F)';
        this.elMagnetBtn.className = 'hud-pill interactive danger';
      }
    }

    // 4. Camera Pill
    if (this.elCameraBtn) {
      this.elCameraBtn.textContent = `🎥 View: ${telemetry.viewMode.toUpperCase()} (C)`;
    }

    // 5. True Compass Heading of the Player (0° North, 90° East, 180° South, 270° West)
    const playerHeadingDeg = ((-telemetry.yawDeg % 360) + 360) % 360;

    let cardinal = 'N';
    if (playerHeadingDeg >= 337.5 || playerHeadingDeg < 22.5) cardinal = 'N';
    else if (playerHeadingDeg >= 22.5 && playerHeadingDeg < 67.5) cardinal = 'NE';
    else if (playerHeadingDeg >= 67.5 && playerHeadingDeg < 112.5) cardinal = 'E';
    else if (playerHeadingDeg >= 112.5 && playerHeadingDeg < 157.5) cardinal = 'SE';
    else if (playerHeadingDeg >= 157.5 && playerHeadingDeg < 202.5) cardinal = 'S';
    else if (playerHeadingDeg >= 202.5 && playerHeadingDeg < 247.5) cardinal = 'SW';
    else if (playerHeadingDeg >= 247.5 && playerHeadingDeg < 292.5) cardinal = 'W';
    else if (playerHeadingDeg >= 292.5 && playerHeadingDeg < 337.5) cardinal = 'NW';

    if (this.elCompassHeading) {
      this.elCompassHeading.textContent = `${cardinal} · ${Math.round(playerHeadingDeg).toString().padStart(3, '0')}°`;
    }

    // 6. Target Position & Phase for Navigation
    let targetX = 0;
    let targetY = 0;
    let targetZ = 0;
    let isPickupPhase = false;
    let targetDist = 0;
    let targetBearingDeg = 0;

    if (activeOrder) {
      if (this.elQuestBanner) this.elQuestBanner.style.display = 'flex';
      if (this.elNavArrowContainer) this.elNavArrowContainer.style.display = 'flex';
      if (this.elTicketContainer) this.elTicketContainer.style.display = 'block';

      if (!telemetry.hasCargoAttached) {
        isPickupPhase = true;
        targetX = parcelEntity ? parcelEntity.body.translation().x : activeOrder.senderPosition[0];
        targetY = parcelEntity ? parcelEntity.body.translation().y : activeOrder.senderPosition[1];
        targetZ = parcelEntity ? parcelEntity.body.translation().z : activeOrder.senderPosition[2];

        if (this.elQuestStepText) {
          this.elQuestStepText.textContent = `📦 STEP 1: Pick up ${activeOrder.parcelConfig.name}`;
        }
        if (this.elQuestSubtext) {
          this.elQuestSubtext.textContent = `Fly to ${activeOrder.senderName} (${activeOrder.senderLocationName}) & hover close to snap (F = magnet)!`;
        }
      } else {
        isPickupPhase = false;
        targetX = activeOrder.targetPosition[0];
        targetY = activeOrder.targetPosition[1];
        targetZ = activeOrder.targetPosition[2];

        if (this.elQuestStepText) {
          this.elQuestStepText.textContent = `🎯 STEP 2: Deliver to ${activeOrder.recipientName}`;
        }
        if (this.elQuestSubtext) {
          this.elQuestSubtext.textContent = `Fly over ${activeOrder.recipientLocationName} & press F to drop parcel onto landing pad!`;
        }
      }

      // Distance in meters
      const dx = targetX - playerPos.x;
      const dz = targetZ - playerPos.z;
      targetDist = Math.hypot(dx, dz);

      // Bearing to Target (Clockwise: North = 0°, East = 90°, etc.)
      const angleRad = Math.atan2(dx, -dz);
      targetBearingDeg = ((angleRad * 180) / Math.PI + 360) % 360;

      // Exact 3D-to-Screen Projection for HUD Pointer Arrow
      if (camera && this.elNavArrowIcon) {
        _vTarget3D.set(targetX, targetY, targetZ);
        _vCamSpace.copy(_vTarget3D).applyMatrix4(camera.matrixWorldInverse);

        let screenAngleDeg = 0;
        if (_vCamSpace.z < 0) {
          // Target is in front of camera
          screenAngleDeg = (Math.atan2(_vCamSpace.x, _vCamSpace.y) * 180) / Math.PI;
        } else {
          // Target is behind camera
          screenAngleDeg = (Math.atan2(-_vCamSpace.x, -_vCamSpace.y) * 180) / Math.PI;
        }

        this.elNavArrowIcon.style.transform = `rotate(${screenAngleDeg}deg)`;
      }

      if (this.elNavDistance) {
        const icon = isPickupPhase ? '📦' : '🎯';
        this.elNavDistance.textContent = `${icon} ${Math.round(targetDist)}m`;
      }

      if (this.elWaypointInfo) {
        if (telemetry.activeWindAlert) {
          this.elWaypointInfo.textContent = telemetry.activeWindAlert;
          this.elWaypointInfo.style.color = '#0284c7';
          this.elWaypointInfo.style.fontWeight = '700';
        } else {
          this.elWaypointInfo.textContent = `${isPickupPhase ? '📦 Pickup' : '🎯 Target'}: ${Math.round(targetDist)}m away`;
          this.elWaypointInfo.style.color = '#1e293b';
          this.elWaypointInfo.style.fontWeight = '600';
        }
      }

      // Update Postage Ticket
      if (this.elTicketTitle) this.elTicketTitle.textContent = activeOrder.title;
      if (this.elTicketRecipient) {
        this.elTicketRecipient.textContent = `To: ${activeOrder.recipientName} (${activeOrder.recipientLocationName})`;
      }

      if (this.elTicketTimer) {
        const mins = Math.floor(orderTimeRemainingSeconds / 60);
        const secs = Math.floor(orderTimeRemainingSeconds % 60);
        this.elTicketTimer.textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;
      }

      if (parcelEntity && this.elHealthFill && this.elHealthText) {
        const hp = Math.max(0, Math.round(parcelEntity.state.currentHealth));
        this.elHealthFill.style.width = `${hp}%`;
        this.elHealthText.textContent = `Condition: ${hp}%`;
        if (hp > 60) this.elHealthFill.style.backgroundColor = '#22c55e';
        else if (hp > 25) this.elHealthFill.style.backgroundColor = '#f59e0b';
        else this.elHealthFill.style.backgroundColor = '#ef4444';
      }
    } else {
      if (this.elQuestBanner) this.elQuestBanner.style.display = 'none';
      if (this.elNavArrowContainer) this.elNavArrowContainer.style.display = 'none';
      if (this.elTicketContainer) this.elTicketContainer.style.display = 'none';
      if (this.elWaypointInfo) {
        if (telemetry.activeWindAlert) {
          this.elWaypointInfo.textContent = telemetry.activeWindAlert;
          this.elWaypointInfo.style.color = '#0284c7';
          this.elWaypointInfo.style.fontWeight = '700';
        } else {
          this.elWaypointInfo.textContent = '📍 Press (H) for Job Board';
          this.elWaypointInfo.style.color = '#1e293b';
          this.elWaypointInfo.style.fontWeight = '600';
        }
      }
    }

    // 7. Draw Panoramic Top Compass Tape (Skyrim/Flight Sim Style)
    this.drawCompassTape(playerHeadingDeg, activeOrder ? targetBearingDeg : null, activeOrder ? targetDist : null, isPickupPhase);

    // 8. Draw Synchronized Top-Down Mini-Map Radar
    this.drawMiniMap(playerPos, telemetry.yawDeg, activeOrder, parcelEntity, isPickupPhase);
  }

  private drawCompassTape(
    headingDeg: number,
    targetBearingDeg: number | null,
    targetDist: number | null,
    isPickupPhase: boolean
  ): void {
    if (!this.tapeCtx || !this.tapeCanvas) return;
    const ctx = this.tapeCtx;
    const w = this.tapeCanvas.width;
    const h = this.tapeCanvas.height;
    const cx = w / 2;
    const pixelsPerDegree = 1.9;

    ctx.clearRect(0, 0, w, h);

    // Subtle dark tape background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fillRect(0, 0, w, h);

    // Baseline axis
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 3);
    ctx.lineTo(w, h - 3);
    ctx.stroke();

    // Draw tick marks and cardinal degree labels
    const fovHalf = (w / 2) / pixelsPerDegree;
    const minDeg = Math.floor(headingDeg - fovHalf);
    const maxDeg = Math.ceil(headingDeg + fovHalf);

    for (let d = minDeg; d <= maxDeg; d++) {
      if (d % 15 !== 0) continue;

      const normDeg = ((d % 360) + 360) % 360;
      let offset = d - headingDeg;
      while (offset > 180) offset -= 360;
      while (offset < -180) offset += 360;
      const x = cx + offset * pixelsPerDegree;

      if (x < 10 || x > w - 10) continue;

      let tickH = 6;
      let text: string | null = null;
      let color = '#94a3b8';
      let font = '9px monospace';

      if (normDeg === 0) {
        text = 'N';
        color = '#ef4444';
        font = 'bold 11px sans-serif';
        tickH = 10;
      } else if (normDeg === 90) {
        text = 'E';
        color = '#facc15';
        font = 'bold 11px sans-serif';
        tickH = 10;
      } else if (normDeg === 180) {
        text = 'S';
        color = '#38bdf8';
        font = 'bold 11px sans-serif';
        tickH = 10;
      } else if (normDeg === 270) {
        text = 'W';
        color = '#facc15';
        font = 'bold 11px sans-serif';
        tickH = 10;
      } else if (normDeg === 45) {
        text = 'NE';
        color = '#cbd5e1';
        font = 'bold 9px sans-serif';
        tickH = 8;
      } else if (normDeg === 135) {
        text = 'SE';
        color = '#cbd5e1';
        font = 'bold 9px sans-serif';
        tickH = 8;
      } else if (normDeg === 225) {
        text = 'SW';
        color = '#cbd5e1';
        font = 'bold 9px sans-serif';
        tickH = 8;
      } else if (normDeg === 315) {
        text = 'NW';
        color = '#cbd5e1';
        font = 'bold 9px sans-serif';
        tickH = 8;
      } else if (normDeg % 30 === 0) {
        text = normDeg.toString().padStart(3, '0');
        color = '#64748b';
        tickH = 6;
      }

      // Tick line
      ctx.strokeStyle = color;
      ctx.lineWidth = text && text.length <= 2 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, h - 3);
      ctx.lineTo(x, h - 3 - tickH);
      ctx.stroke();

      // Label
      if (text) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(text, x, 2);
      }
    }

    // Active Mission Waypoint Marker on Tape
    if (targetBearingDeg !== null && targetDist !== null) {
      let diff = targetBearingDeg - headingDeg;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      const objX = Math.max(16, Math.min(w - 16, cx + diff * pixelsPerDegree));
      const icon = isPickupPhase ? '📦' : '🎯';

      ctx.fillStyle = isPickupPhase ? '#facc15' : '#22c55e';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, objX, 12);
    }
  }

  private drawMiniMap(
    playerPos: { x: number; y: number; z: number },
    yawDeg: number,
    activeOrder: DeliveryOrder | null,
    parcelEntity: any | null,
    isPickupPhase: boolean
  ): void {
    if (!this.radarCtx || !this.radarCanvas) return;
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = w / 480; // 480m valley width mapped to radar canvas

    ctx.clearRect(0, 0, w, h);

    // Background Valley Disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#14532d'; // Deep lush Alpine valley
    ctx.fillRect(0, 0, w, h);

    // 1. Mountain Summits & Contours
    ctx.fillStyle = '#475569';
    // North Monastery Summit
    ctx.beginPath();
    ctx.arc(cx + 70 * scale, cy - 195 * scale, 38 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(cx + 70 * scale, cy - 195 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fill();

    // East Windmill Ridge
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(cx + 175 * scale, cy + 95 * scale, 28 * scale, 0, Math.PI * 2);
    ctx.fill();

    // South Dairy Meadow Green Plateau
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(cx - 95 * scale, cy + 160 * scale, 34 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 2. River Gorge
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let x = -240; x <= 240; x += 10) {
      const z = Math.sin(x * 0.02) * 55 - 15;
      const rx = cx + x * scale;
      const ry = cy + z * scale;
      if (x === -240) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.stroke();

    // 3. Runway & Town Plaza
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx - 28 * scale, cy + 5 * scale, 10 * scale, 75 * scale);

    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(cx + 16 * scale, cy - 4 * scale, 18 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 4. Landmark Pin Badges
    const landmarkPins = [
      { name: 'HQ', x: 0, z: 8, col: '#0284c7' },
      { name: 'Bakery', x: 35, z: 28, col: '#ea580c' },
      { name: 'Farm', x: -95, z: 160, col: '#16a34a' },
      { name: 'Monastery', x: 70, z: -195, col: '#6366f1' },
      { name: 'Windmill', x: 175, z: 95, col: '#ca8a04' },
      { name: 'Bridge', x: -145, z: -110, col: '#78716c' },
    ];

    for (const pin of landmarkPins) {
      const px = cx + pin.x * scale;
      const py = cy + pin.z * scale;
      ctx.fillStyle = pin.col;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. RADIANT GLOWING OBJECTIVE BEACON
    if (activeOrder) {
      const objX = isPickupPhase
        ? parcelEntity ? parcelEntity.body.translation().x : activeOrder.senderPosition[0]
        : activeOrder.targetPosition[0];
      const objZ = isPickupPhase
        ? parcelEntity ? parcelEntity.body.translation().z : activeOrder.senderPosition[2]
        : activeOrder.targetPosition[2];

      const ox = cx + objX * scale;
      const oy = cy + objZ * scale;

      const timeSec = performance.now() * 0.003;
      const ripple1 = timeSec % 1.0;
      const ripple2 = (timeSec + 0.5) % 1.0;

      const mainColor = isPickupPhase ? '#facc15' : '#22c55e';
      const glowRgb = isPickupPhase ? '250, 204, 21' : '34, 197, 94';

      // Outer Glowing Aura Gradient
      const aura = ctx.createRadialGradient(ox, oy, 2, ox, oy, 24);
      aura.addColorStop(0, `rgba(${glowRgb}, 0.7)`);
      aura.addColorStop(0.5, `rgba(${glowRgb}, 0.3)`);
      aura.addColorStop(1, `rgba(${glowRgb}, 0.0)`);
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(ox, oy, 24, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing Wave 1
      ctx.strokeStyle = `rgba(${glowRgb}, ${1.0 - ripple1})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ox, oy, 6 + ripple1 * 18, 0, Math.PI * 2);
      ctx.stroke();

      // Pulsing Wave 2
      ctx.strokeStyle = `rgba(${glowRgb}, ${1.0 - ripple2})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(ox, oy, 6 + ripple2 * 18, 0, Math.PI * 2);
      ctx.stroke();

      // Core Solid Pin with White Border
      ctx.fillStyle = mainColor;
      ctx.beginPath();
      ctx.arc(ox, oy, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Center Icon
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isPickupPhase ? '📦' : '🎯', ox, oy);
    }

    // 6. SYNCHRONIZED PLAYER MARKER & HEADING FIELD OF VIEW CONE
    const px = cx + playerPos.x * scale;
    const py = cy + playerPos.z * scale;

    // True mathematical angle on the 2D canvas:
    // When yawDeg = 0 (Facing North, -Z in world), angle on canvas is -PI/2 (Straight UP towards North).
    // When yawDeg = -90 (Facing East, +X in world), angle on canvas is 0 (Straight RIGHT towards East).
    // When yawDeg = 180 (Facing South, +Z in world), angle on canvas is +PI/2 (Straight DOWN towards South).
    // When yawDeg = 90 (Facing West, -X in world), angle on canvas is PI (Straight LEFT towards West).
    const canvasHeadingRad = -Math.PI / 2 - (yawDeg * Math.PI) / 180;

    // Heading View Cone (Yellow sector)
    const coneGrad = ctx.createRadialGradient(px, py, 2, px, py, 26);
    coneGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
    coneGrad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 26, canvasHeadingRad - 0.45, canvasHeadingRad + 0.45);
    ctx.closePath();
    ctx.fill();

    // Player Directional Arrow Dart
    ctx.save();
    ctx.translate(px, py);
    // Rotate canvas so local (0, -9) points in canvasHeadingRad
    ctx.rotate(canvasHeadingRad + Math.PI / 2);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 7. RADAR BEZEL FRAME WITH CARDINAL COMPASS MARKS (N, S, E, W)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks every 30 degrees
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    for (let deg = 0; deg < 360; deg += 30) {
      if (deg % 90 === 0) continue;
      const a = (deg * Math.PI) / 180;
      const r1 = cx - 2;
      const r2 = cx - 7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    // Cardinal Points
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // North (Red 'N' with white shadow)
    ctx.fillStyle = '#ef4444';
    ctx.fillText('N', cx, 11);

    // South ('S' in Sky Blue)
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('S', cx, h - 11);

    // East ('E' in Gold)
    ctx.fillStyle = '#facc15';
    ctx.fillText('E', w - 11, cy);

    // West ('W' in Gold)
    ctx.fillStyle = '#facc15';
    ctx.fillText('W', 11, cy);
  }
}
