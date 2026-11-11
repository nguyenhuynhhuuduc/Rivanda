import Link from "next/link";
import { CommentIcon, HeartIcon } from "@/components/icons";
import { thumbOf, type Photo } from "@/lib/discovery";

export function PhotoTile({ photo }: { photo: Photo }) {
  const label = photo.title || photo.caption || photo.locationName || "";
  return (
    <Link href={`/journeystory/photos/${photo.id}`} className="group mb-5 block break-inside-avoid">
      <div className="overflow-hidden rounded-md bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbOf(photo)}
          alt={label || "Ảnh hành trình"}
          loading="lazy"
          width={photo.width ?? undefined}
          height={photo.height ?? undefined}
          className="h-auto w-full transition duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span className="line-clamp-1 text-fg">{label}</span>
        <span className="flex shrink-0 items-center gap-3 text-muted">
          <span className="flex items-center gap-1"><HeartIcon className="h-4 w-4" />{photo.likes}</span>
          <span className="flex items-center gap-1"><CommentIcon className="h-4 w-4" />{photo.comments}</span>
        </span>
      </div>
    </Link>
  );
}

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
      {photos.map((p) => <PhotoTile key={p.id} photo={p} />)}
    </div>
  );
}
