import { storageUsage } from "@/lib/discovery-community/storage";
import type { Actor } from "@/lib/discovery-community/model";
import { StorageMeterView } from "./StorageMeterView";

export async function StorageMeter({ actor }: { actor: Actor }) {
  const usage = await storageUsage(actor);
  return <StorageMeterView usage={usage} />;
}
