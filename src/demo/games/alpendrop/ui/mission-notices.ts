/**
 * Mission Notices
 * Non-blocking, GTA-style popups that report delivery results and hints over
 * the HUD, so the player never gets yanked out of flight by a modal dialog.
 */

import type { DeliveryEvaluation } from '../cargo/delivery-zones.js';

const MAX_VISIBLE = 3;

export class MissionNotices {
  private stack: HTMLElement | null;

  constructor() {
    this.stack = document.getElementById('notice-stack');
  }

  /** Short single-line popup for pickups, drops, damage and other beats. */
  show(icon: string, title: string, detail?: string, tone: 'good' | 'warn' | 'bad' | 'info' = 'info', ttlMs = 4200): void {
    const el = document.createElement('div');
    el.className = `notice slim ${tone}`;
    el.innerHTML = `
      <span class="notice-icon">${icon}</span>
      <span class="notice-body">
        <span class="notice-title">${title}</span>
        ${detail ? `<span class="notice-text">${detail}</span>` : ''}
      </span>
    `;
    this.push(el, ttlMs);
  }

  /** Full delivery result card, replacing the old blocking evaluation modal. */
  showDeliveryResult(result: DeliveryEvaluation, jobBoardKey = 'H'): void {
    const el = document.createElement('div');
    el.className = 'notice good';
    el.innerHTML = `
      <span class="notice-grade grade-${result.accuracyGrade}">${result.accuracyGrade}</span>
      <span class="notice-body">
        <span class="notice-title">Delivery Complete</span>
        <span class="notice-text">${result.feedbackText}</span>
        <span class="notice-payout">
          <span class="notice-chip pay">+${result.totalRewardFrancs} ₣</span>
          <span class="notice-chip stamp">+★${result.trustStampsEarned}</span>
          ${result.timeBonus > 0 ? `<span class="notice-chip">Speed +${result.timeBonus}</span>` : ''}
          ${result.precisionBonus > 0 ? `<span class="notice-chip">Precision +${result.precisionBonus}</span>` : ''}
        </span>
        <span class="notice-cta">
          Press <span class="notice-key">${jobBoardKey}</span> for the next job
        </span>
      </span>
    `;
    this.push(el, 9000);
  }

  private push(el: HTMLElement, ttlMs: number): void {
    if (!this.stack) return;
    this.stack.appendChild(el);

    // Retire the oldest cards so the stack never crowds out the flight view
    while (this.stack.children.length > MAX_VISIBLE) {
      this.dismiss(this.stack.firstElementChild as HTMLElement);
    }

    window.setTimeout(() => this.dismiss(el), ttlMs);
  }

  private dismiss(el: HTMLElement | null): void {
    if (!el || el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), 480);
  }
}
