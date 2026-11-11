"use client";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readNotificationAction } from "@/app/(light)/account/notifications/actions";
import styles from "./Notifications.module.css";
export function ReadNotification({id}:{id?:string}){
  const[state,action,pending]=useActionState(readNotificationAction,{});
  return <form action={action}><input type="hidden" name="operation" value={id?"one":"all"}/>{id&&<input type="hidden" name="id" value={id}/>}<button disabled={pending} className={styles.button}>{pending?"Đang cập nhật…":id?"Đánh dấu đã đọc":"Đánh dấu tất cả đã đọc"}</button>{state.error&&<p role="alert" className={styles.feedback}>{state.error}</p>}{state.message&&<p role="status" className={styles.feedback}>{state.message}</p>}</form>;
}
export function RefreshNotifications(){const router=useRouter(),[pending,start]=useTransition();return <button className={styles.button} disabled={pending} onClick={()=>start(()=>router.refresh())}>{pending?"Đang tải…":"Làm mới"}</button>;}
