"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function NotificationBell({unread,userId}:{unread:number;userId?:string}){
  const [count,setCount]=useState(unread);
  useEffect(()=>setCount(unread),[unread,userId]);
  useEffect(()=>{
    let controller:AbortController|null=null,last=Date.now(),stopped=false;
    const refresh=async()=>{
      if(stopped||document.visibilityState!=="visible"||controller||Date.now()-last<30000)return;
      last=Date.now();const current=new AbortController();controller=current;const timeout=setTimeout(()=>current.abort(),10000);
      try{const response=await fetch("/api/discovery/notifications/unread",{cache:"no-store",credentials:"same-origin",signal:current.signal});if(response.status===401){if(!stopped)setCount(0);return;}if(!response.ok)return;const data=await response.json();if(!stopped&&Number.isSafeInteger(data.unread)&&data.unread>=0)setCount(data.unread);}
      catch{/* Preserve the last known badge on a transient network failure. */}
      finally{clearTimeout(timeout);if(controller===current)controller=null;}
    };
    const timer=setInterval(()=>void refresh(),90000);const onFocus=()=>void refresh();
    window.addEventListener("focus",onFocus);document.addEventListener("visibilitychange",onFocus);
    return()=>{stopped=true;clearInterval(timer);controller?.abort();window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onFocus);};
  },[userId]);
  const unreadCount=count;
  return <Link href="/account/notifications" prefetch={false} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted transition hover:bg-card hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link motion-reduce:transition-none" aria-label={`Thông báo${unreadCount?`, ${unreadCount} chưa đọc`:", không có thông báo chưa đọc"}`}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>
    {unreadCount>0&&<span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">{unreadCount>99?"99+":unreadCount}</span>}
  </Link>;
}
