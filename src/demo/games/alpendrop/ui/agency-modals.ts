/**
 * Agency Modals & Dialog Controllers
 * Manages the Job Board, Hangar Fleet Workshop, and Delivery Evaluation Results Modal.
 * High-contrast, ultra-readable Aero Glass styling with instant tab navigation.
 */

import { CAMPAIGN_ORDERS, type DeliveryOrder } from '../agency/orders.js';
import { AGENCY_UPGRADES, type CareerStore } from '../agency/career-store.js';
import { VEHICLE_CATALOG } from '../flight/specs.js';
import type { DeliveryEvaluation } from '../cargo/delivery-zones.js';
import type { VehicleId } from '../flight/types.js';

export class AgencyModals {
  private modalBackdrop: HTMLElement;
  private modalContainer: HTMLElement;
  private career: CareerStore;
  private activeTab: 'jobs' | 'fleet' | 'upgrades' = 'jobs';

  private onSelectOrderCb?: (order: DeliveryOrder) => void;
  private onSelectVehicleCb?: (vehicleId: VehicleId) => void;

  constructor(career: CareerStore) {
    this.career = career;
    this.modalBackdrop = document.getElementById('modal-backdrop')!;
    this.modalContainer = document.getElementById('modal-card')!;

    this.modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) {
        this.close();
      }
    });
  }

  setCallbacks(
    onSelectOrder: (order: DeliveryOrder) => void,
    onSelectVehicle: (vehicleId: VehicleId) => void
  ): void {
    this.onSelectOrderCb = onSelectOrder;
    this.onSelectVehicleCb = onSelectVehicle;
  }

  close(): void {
    this.modalBackdrop.style.display = 'none';
    this.modalContainer.innerHTML = '';
  }

  showJobBoard(): void {
    this.activeTab = 'jobs';
    this.renderModal();
  }

  showHangar(): void {
    this.activeTab = 'fleet';
    this.renderModal();
  }

  showUpgrades(): void {
    this.activeTab = 'upgrades';
    this.renderModal();
  }

  private renderModal(): void {
    this.modalBackdrop.style.display = 'flex';

    // Top Navigation Tabs
    const tabsHtml = `
      <div class="modal-tabs">
        <button class="modal-tab ${this.activeTab === 'jobs' ? 'active' : ''}" id="tab-jobs">📬 Delivery Jobs</button>
        <button class="modal-tab ${this.activeTab === 'fleet' ? 'active' : ''}" id="tab-fleet">🚁 Fleet Vehicles</button>
        <button class="modal-tab ${this.activeTab === 'upgrades' ? 'active' : ''}" id="tab-upgrades">🛠️ Assists & Gear</button>
      </div>
    `;

    let contentHtml = '';
    let titleText = '📬 AlpenDrop Post Office — Job Board';

    if (this.activeTab === 'jobs') {
      titleText = '📬 AlpenDrop Airmail — Job Board';
      contentHtml = `
        <div class="jobs-grid">
          ${CAMPAIGN_ORDERS.map((order) => {
            const isLocked = this.career.trustStamps < order.requiredStamps;
            const reward = order.parcelConfig.baseRewardFrancs + order.bonusRewardFrancs;
            return `
              <div class="modal-item-card ${isLocked ? 'locked' : ''}">
                <div class="card-header">
                  <div class="card-title">${order.title}</div>
                  <span class="badge-weight">${order.parcelConfig.massKg} kg</span>
                </div>
                <div class="route-line">
                  <span class="route-from">📍 ${order.senderLocationName}</span>
                  <span class="route-arrow">➔</span>
                  <span class="route-to">🎯 ${order.recipientLocationName}</span>
                </div>
                <div class="dialogue-quote">${order.dialogueQuote}</div>
                <div class="order-specs">
                  <span>⏱️ <strong>${order.timeLimitSeconds}s</strong> Limit</span>
                  <span>💔 Fragility: <strong>${Math.round(order.parcelConfig.fragility * 100)}%</strong></span>
                  <span>⭐ Stamps: <strong>+★${order.parcelConfig.trustStampsReward}</strong></span>
                </div>
                <div class="card-footer">
                  <div class="reward-pill">+${reward} ₣</div>
                  ${
                    isLocked
                      ? `<button class="btn-action btn-locked" disabled>🔒 Needs ★${order.requiredStamps}</button>`
                      : `<button class="btn-action btn-accept" data-order-id="${order.id}">Accept Job ➔</button>`
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (this.activeTab === 'fleet') {
      titleText = '🚁 Agency Hangar — Fleet Hangar';
      contentHtml = `
        <div class="jobs-grid">
          ${Object.values(VEHICLE_CATALOG).map((v) => {
            const isOwned = this.career.ownedVehicles.has(v.id);
            const isEquipped = this.career.currentVehicleId === v.id;
            const canAfford = this.career.francBalance >= v.price;

            let actionBtn = '';
            if (isEquipped) {
              actionBtn = `<button class="btn-action btn-equipped" disabled>✓ Active Aircraft</button>`;
            } else if (isOwned) {
              actionBtn = `<button class="btn-action btn-accept" data-equip-id="${v.id}">Select</button>`;
            } else {
              actionBtn = `<button class="btn-action ${canAfford ? 'btn-buy' : 'btn-locked'}" data-buy-vehicle="${v.id}" ${canAfford ? '' : 'disabled'}>Buy: ${v.price} ₣</button>`;
            }

            return `
              <div class="modal-item-card ${isEquipped ? 'equipped' : ''}">
                <div class="card-header">
                  <div class="card-title">${v.name}</div>
                  <span class="badge-tier">Tier ${v.tier} ${v.vehicleClass.toUpperCase()}</span>
                </div>
                <div class="card-desc">${v.description}</div>
                <div class="order-specs">
                  <span>⚡ Speed: <strong>${v.maxAirspeedKmh} km/h</strong></span>
                  <span>📦 Payload: <strong>${v.maxPayloadKg} kg</strong></span>
                  <span>🔋 Battery: <strong>${v.batteryCapacitySeconds}s</strong></span>
                </div>
                <div class="card-footer">
                  <div class="reward-pill">${v.price > 0 ? `${v.price} ₣` : 'Starter'}</div>
                  ${actionBtn}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      titleText = '🛠️ Workshop — Assists & Flight Gear';
      contentHtml = `
        <div class="jobs-grid">
          ${AGENCY_UPGRADES.map((u) => {
            const canBuy = this.career.canBuyUpgrade(u.id);
            let isUnlocked = false;

            if (u.id === 'gyro_1') isUnlocked = this.career.gyroLevel >= 1;
            else if (u.id === 'gyro_2') isUnlocked = this.career.gyroLevel >= 2;
            else if (u.id === 'gyro_3') isUnlocked = this.career.gyroLevel >= 3;
            else if (u.id === 'auto_hover') isUnlocked = this.career.autoHoverTrim;
            else if (u.id === 'cushioned_skids') isUnlocked = this.career.cushionedSkids;
            else if (u.id === 'parachute_kit') isUnlocked = this.career.hasParachuteKit;
            else if (u.id === 'extended_battery') isUnlocked = this.career.extendedBattery;

            return `
              <div class="modal-item-card ${isUnlocked ? 'equipped' : ''}">
                <div class="card-header">
                  <div class="card-title">${u.icon} ${u.name}</div>
                  <span class="badge-tier">Tier ${u.tier}</span>
                </div>
                <div class="card-desc">${u.description}</div>
                <div class="order-specs">
                  <span>Required: <strong>★${u.requiredStamps} Stamps</strong></span>
                </div>
                <div class="card-footer">
                  <div class="reward-pill">${u.costFrancs} ₣</div>
                  ${
                    isUnlocked
                      ? `<span class="badge-installed">✓ Installed</span>`
                      : `<button class="btn-action ${canBuy ? 'btn-buy' : 'btn-locked'}" data-buy-upgrade="${u.id}" ${canBuy ? '' : 'disabled'}>Install</button>`
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    this.modalContainer.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">${titleText}</h2>
        <button class="btn-close" id="btn-modal-close">&times;</button>
      </div>
      ${tabsHtml}
      ${contentHtml}
    `;

    // Event Bindings
    document.getElementById('btn-modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('tab-jobs')?.addEventListener('click', () => this.showJobBoard());
    document.getElementById('tab-fleet')?.addEventListener('click', () => this.showHangar());
    document.getElementById('tab-upgrades')?.addEventListener('click', () => this.showUpgrades());

    // Accept Job click
    this.modalContainer.querySelectorAll('[data-order-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.orderId!;
        const order = CAMPAIGN_ORDERS.find((o) => o.id === id);
        if (order && this.onSelectOrderCb) {
          this.close();
          this.onSelectOrderCb(order);
        }
      });
    });

    // Equip vehicle click
    this.modalContainer.querySelectorAll('[data-equip-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.equipId as VehicleId;
        this.career.selectVehicle(id);
        this.onSelectVehicleCb?.(id);
        this.showHangar();
      });
    });

    // Buy vehicle click
    this.modalContainer.querySelectorAll('[data-buy-vehicle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.buyVehicle as VehicleId;
        if (this.career.buyVehicle(id)) {
          this.onSelectVehicleCb?.(id);
          this.showHangar();
        }
      });
    });

    // Buy upgrade click
    this.modalContainer.querySelectorAll('[data-buy-upgrade]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.buyUpgrade!;
        if (this.career.buyUpgrade(id)) {
          this.showUpgrades();
        }
      });
    });
  }

  showDeliveryResult(result: DeliveryEvaluation, onNextJob: () => void): void {
    this.modalBackdrop.style.display = 'flex';

    this.modalContainer.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">🎉 Delivery Completed!</h2>
        <button class="btn-close" id="btn-modal-close">&times;</button>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; gap:16px; text-align:center;">
        <div class="grade-badge grade-${result.accuracyGrade}">${result.accuracyGrade}</div>
        <p style="font-size:16px; font-weight:600; color:#f8fafc;">${result.feedbackText}</p>

        <div style="background:rgba(30, 41, 59, 0.85); border:1.5px solid var(--glass-border); border-radius:14px; padding:18px; width:100%; max-width:420px; text-align:left; color:#f8fafc;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span>Base Delivery Fee:</span>
            <strong style="color:#facc15;">+${result.baseReward} ₣</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#4ade80;">
            <span>Speed Bonus:</span>
            <strong>+${result.timeBonus} ₣</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#38bdf8;">
            <span>Landing Precision:</span>
            <strong>+${result.precisionBonus} ₣</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-top:1px solid rgba(148, 163, 184, 0.2); padding-top:10px; margin-top:10px; font-size:18px; font-weight:700; color:#facc15;">
            <span>Total Payout:</span>
            <span>+${result.totalRewardFrancs} ₣ (+★${result.trustStampsEarned})</span>
          </div>
        </div>

        <button class="btn-action btn-accept" id="btn-result-next" style="font-size:16px; padding:12px 36px;">Open Job Board ➔</button>
      </div>
    `;

    document.getElementById('btn-modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('btn-result-next')?.addEventListener('click', () => {
      this.close();
      onNextJob();
    });
  }
}
