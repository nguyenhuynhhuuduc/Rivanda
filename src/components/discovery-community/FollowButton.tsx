"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { followAction } from "@/app/(light)/profile/actions";
import { discoveryLoginHref } from "./DiscoveryUI";
import styles from "./Discovery.module.css";

export function FollowButton({targetId,name,viewerId,following=false,followsViewer=false,returnTo}:{targetId:string;name:string;viewerId?:string|null;following?:boolean;followsViewer?:boolean;returnTo:string}) {
  const [value,setValue]=useState(following),[error,setError]=useState(""),[message,setMessage]=useState(""),[pending,start]=useTransition();
  useEffect(()=>{setValue(following);},[following]);
  if(viewerId===targetId)return null;
  if(!viewerId)return <Link href={discoveryLoginHref(returnTo)} className={styles.followButton} aria-label={`Đăng nhập để theo dõi ${name}`}>Theo dõi</Link>;
  const followBack = !value && followsViewer;
  const label = pending ? "Đang cập nhật…" : value ? "Đang theo dõi" : followBack ? "Theo dõi lại" : "Theo dõi";
  return <div className={styles.followControl}><button type="button" className={styles.followButton} data-follow-back={followBack ? "true" : undefined} disabled={pending} aria-pressed={value} aria-label={`${value?"Bỏ theo dõi":followBack?"Theo dõi lại":"Theo dõi"} ${name}`} onClick={()=>start(async()=>{
    setError("");setMessage("");
    const form=new FormData();form.set("targetId",targetId);form.set("operation",value?"unfollow":"follow");form.set("returnTo",returnTo);
    try {const result=await followAction(form);if(result.error)setError(result.error);else if(typeof result.following==="boolean"){setValue(result.following);setMessage(result.following?`Đã theo dõi ${name}.`:`Đã bỏ theo dõi ${name}.`);}}
    catch{setError("Mất kết nối. Hãy tải lại để kiểm tra trạng thái rồi thử lại.");}
  })}>{label}</button>{pending&&<span role="status" className="sr-only">Đang cập nhật theo dõi</span>}{message&&<span role="status" className="sr-only">{message}</span>}{error&&<p role="alert" className={styles.followError}>{error}</p>}</div>;
}
