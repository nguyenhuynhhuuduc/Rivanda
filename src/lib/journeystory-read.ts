import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { listTrips } from "./discovery";
import { safeMapsUrl, type JourneyPreview } from "./journeystory-view";

export async function journeyCollections({ includeEmpty = false }: { includeEmpty?: boolean } = {}): Promise<JourneyPreview[]> {
  // Trip metadata is already public via getTripBySlug (trips has no draft/private flag).
  // Home keeps those trips visible with a default cover; the library keeps its current filter.
  // listTrips still selects cover files/counts from published photos only.
  const trips = await listTrips({ onlyWithPhotos: !includeEmpty });
  if (!trips.length) return [];
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, created_at FROM trips WHERE id IN (?)", [trips.map(t => t.id)]);
  const dates = new Map(rows.map(r => { const date = r.created_at ? new Date(r.created_at) : null; return [r.id as string, date && Number.isFinite(date.getTime()) ? date.toISOString() : null]; }));
  return trips.map(t => ({ id: t.id, slug: t.slug, title: t.title, description: t.description, locationName: t.locationName,
    coverFile: t.coverFile, photoCount: t.photoCount, isFeatured: t.isFeatured, createdAt: dates.get(t.id) ?? null }));
}
export type JourneyPlace = { name: string; mapsUrl: string };
export async function journeyPlaces(tripId: string, photoIds: string[]): Promise<{ trip: JourneyPlace[]; photos: Record<string, JourneyPlace> }> {
  // 008 is optional and is NOT installed by this code. Incomplete/absent tables produce no links.
  const [cols] = await pool.query<RowDataPacket[]>("SELECT TABLE_NAME t,COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('journey_places','journey_trip_places','journey_photo_places')");
  const present = new Set(cols.map(r => `${r.t}.${r.c}`));
  const placeReady = ["id", "name", "maps_url"].every(c => present.has(`journey_places.${c}`));
  const out: { trip: JourneyPlace[]; photos: Record<string, JourneyPlace> } = { trip: [], photos: {} };
  if (!placeReady) return out;
  if (["trip_id", "place_id", "sort_order"].every(c => present.has(`journey_trip_places.${c}`))) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT p.name,p.maps_url FROM journey_trip_places j JOIN journey_places p ON p.id=j.place_id WHERE j.trip_id=? ORDER BY j.sort_order,p.id", [tripId]);
    for (const row of rows) { const url = safeMapsUrl(row.maps_url); if (url) out.trip.push({ name: row.name, mapsUrl: url }); }
  }
  if (photoIds.length && ["photo_id", "place_id"].every(c => present.has(`journey_photo_places.${c}`))) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT j.photo_id,p.name,p.maps_url FROM journey_photo_places j JOIN journey_places p ON p.id=j.place_id JOIN photos ph ON ph.id=j.photo_id AND ph.status='published' WHERE j.photo_id IN (?)", [photoIds]);
    for (const row of rows) { const url = safeMapsUrl(row.maps_url); if (url) out.photos[row.photo_id] = { name: row.name, mapsUrl: url }; }
  }
  return out;
}
