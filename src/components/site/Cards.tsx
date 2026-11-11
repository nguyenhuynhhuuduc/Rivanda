import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { Album, Trip } from "@/lib/discovery";

function Cover({ file, alt }: { file: string | null; alt: string }) {
  return file ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/uploads/${file}`} alt={alt} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
  ) : (
    <div className="aspect-[4/3] w-full bg-card" />
  );
}

export function JourneyCard({ trip, large }: { trip: Trip; large?: boolean }) {
  return (
    <Link href={`/journeystory/journeys/${trip.slug}`} className="group block">
      <div className={`overflow-hidden rounded-md bg-card ${large ? "[&_img]:aspect-[16/9]" : ""}`}>
        <Cover file={trip.coverFile} alt={trip.title} />
      </div>
      <h3 className={`mt-3 font-display font-bold leading-snug ${large ? "text-2xl" : "text-xl"}`}>{trip.title}</h3>
      <p className="mt-1 text-sm text-muted">
        {[trip.locationName, trip.startDate ? formatDate(trip.startDate) : null, `${trip.photoCount} ảnh`].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link href={`/journeystory/albums/${album.slug}`} className="group block">
      <div className="overflow-hidden rounded-md bg-card"><Cover file={album.coverFile} alt={album.title} /></div>
      <h3 className="mt-3 font-display text-xl font-bold leading-snug">{album.title}</h3>
      <p className="mt-1 text-sm text-muted">{album.photoCount} ảnh{album.tripTitle ? ` · ${album.tripTitle}` : ""}</p>
    </Link>
  );
}
