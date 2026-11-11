import { btnPrimary, Eyebrow, inputCls } from "@/components/ui/kit";
import { joinWaitlistAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop" };

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ joined?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-28 text-center">
      <Eyebrow>Shop</Eyebrow>
      <h1 className="mt-4 font-display text-5xl font-bold tracking-tight sm:text-6xl">Sắp ra mắt</h1>
      <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-muted">
        Một bộ sưu tập thời trang riêng đang được chuẩn bị. Để lại email, tôi sẽ báo cho bạn ngay khi cửa hàng mở.
      </p>
      {sp.joined ? (
        <p role="status" className="mt-10 rounded-md bg-card px-6 py-4">Cảm ơn bạn! Email của bạn đã được ghi nhận.</p>
      ) : (
        <form action={joinWaitlistAction} className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row">
          <label htmlFor="email" className="sr-only">Email</label>
          <input id="email" name="email" type="email" required maxLength={255} placeholder="Email của bạn" autoComplete="email" className={inputCls} />
          <button className={`${btnPrimary} shrink-0`}>Báo cho tôi</button>
        </form>
      )}
      {sp.error && <p role="alert" className="mt-4 text-sm text-danger">Email chưa đúng định dạng. Hãy kiểm tra lại.</p>}
    </div>
  );
}
