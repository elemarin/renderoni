/**
 * Order Generation & Villager Quest Job Board
 * Configured with elevated rooftop and clear plaza helipad coordinates across 3 Alpine towns.
 */

import { PARCEL_CATALOG } from '../cargo/parcel-entity.js';
import type { ParcelConfig } from '../cargo/types.js';

export interface DeliveryOrder {
  id: string;
  title: string;
  senderName: string;
  senderLocationName: string;
  senderPosition: [number, number, number];
  recipientName: string;
  recipientLocationName: string;
  targetZoneId: string;
  targetPosition: [number, number, number];
  targetRadius: number;
  parcelConfig: ParcelConfig;
  dialogueQuote: string;
  timeLimitSeconds: number;
  bonusRewardFrancs: number;
  requiredStamps: number;
}

export const CAMPAIGN_ORDERS: DeliveryOrder[] = [
  {
    id: 'order_1_strudel',
    title: 'Apfelstrudel for the Peak Monastery',
    senderName: 'Grandma Gretel',
    senderLocationName: 'Bakery Rooftop Pad',
    senderPosition: [35, 11.2, 28],
    recipientName: 'Brother Anselm',
    recipientLocationName: 'Monk Cliff Lookout (Summit Deck)',
    targetZoneId: 'monastery_terrace',
    targetPosition: [65, 71.0, -190.5], // Unobstructed panoramic terrace deck!
    targetRadius: 9.0,
    parcelConfig: PARCEL_CATALOG.strudel,
    dialogueQuote:
      '"Oh, dear child! Brother Anselm is shivering up on the summit lookout terrace. Fly this piping hot apple strudel to him before the mountain frost chills it!"',
    timeLimitSeconds: 120,
    bonusRewardFrancs: 40,
    requiredStamps: 0,
  },
  {
    id: 'order_2_clock',
    title: 'Fragile Cuckoo Clock Rush',
    senderName: 'Klaus the Horologist',
    senderLocationName: 'Town Square Plaza Pad',
    senderPosition: [16, 4.2, -4],
    recipientName: 'Greta at Meadow Farm',
    recipientLocationName: 'Dairy Barn Rooftop Pad',
    targetZoneId: 'dairy_meadow',
    targetPosition: [-95, 26.5, 160],
    targetRadius: 8.0,
    parcelConfig: PARCEL_CATALOG.clock,
    dialogueQuote:
      '"Halt! Treat this clock like spun sugar! One jolt against a chimney and spring number 42 will ping straight into the clouds!"',
    timeLimitSeconds: 135,
    bonusRewardFrancs: 60,
    requiredStamps: 1,
  },
  {
    id: 'order_3_cheese',
    title: 'Giant 80kg Alpine Cheese Roll',
    senderName: 'Dairy Master Fritz',
    senderLocationName: 'Dairy Barn Rooftop',
    senderPosition: [-95, 26.5, 160],
    recipientName: 'Gorge Innkeeper',
    recipientLocationName: 'Canyon Lookout Deck',
    targetZoneId: 'gorge_bridge',
    targetPosition: [-150, 21.8, -126],
    targetRadius: 8.0,
    parcelConfig: PARCEL_CATALOG.cheese_wheel,
    dialogueQuote:
      '"This wheel of Gruyere is heavier than my prize heifer. Keep her steady, or she\'ll roll down the ravine like a runaway boulder!"',
    timeLimitSeconds: 150,
    bonusRewardFrancs: 75,
    requiredStamps: 2,
  },
  {
    id: 'order_4_fondue',
    title: "Mayor's Hot Fondue Feast",
    senderName: 'Hans the Cheesemaker',
    senderLocationName: 'Bakery Rooftop Pad',
    senderPosition: [35, 11.2, 28],
    recipientName: 'Mayor Alois',
    recipientLocationName: 'Hotel Alpenrose Rooftop Pad',
    targetZoneId: 'town_square',
    targetPosition: [-30, 11.8, -26],
    targetRadius: 7.5,
    parcelConfig: PARCEL_CATALOG.fondue,
    dialogueQuote:
      '"The town council is starving! Deliver this simmering cauldron of cheese right onto the hotel roof without tipping a single drop!"',
    timeLimitSeconds: 110,
    bonusRewardFrancs: 50,
    requiredStamps: 2,
  },
  {
    id: 'order_5_flowers',
    title: 'Rare Cliffside Edelweiss Bouquet',
    senderName: 'Heidi the Botanist',
    senderLocationName: 'Windmill Ridge Crest Deck',
    senderPosition: [158, 42.8, 88],
    recipientName: 'Grandma Gretel',
    recipientLocationName: 'Bakery Rooftop Pad',
    targetZoneId: 'bakery_balcony',
    targetPosition: [35, 11.2, 28],
    targetRadius: 7.0,
    parcelConfig: PARCEL_CATALOG.flowers,
    dialogueQuote:
      '"I harvested these delicate Edelweiss blooms from the dizzying razor ridge above. Fly them to Grandma Gretel before the petals wilt!"',
    timeLimitSeconds: 120,
    bonusRewardFrancs: 65,
    requiredStamps: 3,
  },
  {
    id: 'order_6_medicine',
    title: 'Emergency Summit Antibiotics',
    senderName: 'Dr. Vogel (Town Clinic)',
    senderLocationName: 'Town Square Plaza Pad',
    senderPosition: [16, 4.2, -4],
    recipientName: 'Father Thomas',
    recipientLocationName: 'Monk Cliff Lookout Terrace',
    targetZoneId: 'monastery_terrace',
    targetPosition: [65, 71.0, -190.5],
    targetRadius: 9.0,
    parcelConfig: PARCEL_CATALOG.medicine,
    dialogueQuote:
      '"A freezing blizzard is creeping over the north ridge! Father Thomas urgently needs these medicines at the peak summit. Godspeed!"',
    timeLimitSeconds: 115,
    bonusRewardFrancs: 90,
    requiredStamps: 4,
  },
  {
    id: 'order_7_lake_supplies',
    title: 'Smoked Trout Shipment for Bergdorf Lodge',
    senderName: 'Captain Urs (Seeberg Fishery)',
    senderLocationName: 'Seeberg Lakeside Pier Pad',
    senderPosition: [120, 4.8, -75],
    recipientName: 'Lodge Hostess Brigit',
    recipientLocationName: 'Bergdorf Overlook Landing Deck',
    targetZoneId: 'bergdorf_hamlet',
    targetPosition: [160, 24.8, 45],
    targetRadius: 8.0,
    parcelConfig: PARCEL_CATALOG.cheese_wheel,
    dialogueQuote:
      '"Fresh catch from Lake Seeberg! Fly this timber crate up to the ski lodge terrace in Bergdorf before dinner service begins!"',
    timeLimitSeconds: 140,
    bonusRewardFrancs: 85,
    requiredStamps: 3,
  },
  {
    id: 'order_8_telegram',
    title: 'Urgent Telegram to the Ridge',
    senderName: 'Postmaster Otto',
    senderLocationName: 'Town Square Plaza Pad',
    senderPosition: [16, 4.2, -4],
    recipientName: 'Heidi the Botanist',
    recipientLocationName: 'Windmill Ridge Observation Deck',
    targetZoneId: 'windmill_ridge',
    targetPosition: [158, 42.8, 88],
    targetRadius: 6.5,
    parcelConfig: PARCEL_CATALOG.letter,
    dialogueQuote:
      '"Featherweight and barely worth the postage, but Heidi has been waiting a fortnight for these seed catalogues. Ride the ridge thermals and she\'ll have them by supper!"',
    timeLimitSeconds: 130,
    bonusRewardFrancs: 35,
    requiredStamps: 0,
  },
  {
    id: 'order_9_rescue_gear',
    title: 'Climbing Gear for the Ski Lodge',
    senderName: 'Mountain Rescue Ulrich',
    senderLocationName: 'Town Square Plaza Pad',
    senderPosition: [16, 4.2, -4],
    recipientName: 'Lodge Hostess Brigit',
    recipientLocationName: 'Bergdorf Overlook Landing Deck',
    targetZoneId: 'bergdorf_hamlet',
    targetPosition: [160, 24.8, 45],
    targetRadius: 8.0,
    parcelConfig: PARCEL_CATALOG.tools,
    dialogueQuote:
      '"Heavy crate, sturdy contents. Nothing in here will shatter, so don\'t fret about the landing - just fight the crosswind and keep her level on the climb!"',
    timeLimitSeconds: 165,
    bonusRewardFrancs: 55,
    requiredStamps: 0,
  },
  {
    id: 'order_10_lakeside_blooms',
    title: 'Wedding Blooms for the Lakeside Pier',
    senderName: 'Heidi the Botanist',
    senderLocationName: 'Windmill Ridge Crest Deck',
    senderPosition: [158, 42.8, 88],
    recipientName: 'Captain Urs',
    recipientLocationName: 'Seeberg Lakeside Pier Pad',
    targetZoneId: 'seeberg_lakeside',
    targetPosition: [120, 4.8, -75],
    targetRadius: 8.5,
    parcelConfig: PARCEL_CATALOG.flowers,
    dialogueQuote:
      '"The Captain is marrying his sweetheart on the pier at sundown! Glide these blooms down off the ridge gently - a hard drop and the whole village will know it was you."',
    timeLimitSeconds: 125,
    bonusRewardFrancs: 45,
    requiredStamps: 0,
  },
];
