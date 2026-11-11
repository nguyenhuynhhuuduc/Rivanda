"use client";
import { useState } from "react";
import { ShareIcon } from "@/components/icons";
import styles from "./Discovery.module.css";
export function SharePost({id}:{id:string}){
  const [message,setMessage]=useState("");
  async function share(){const url=new URL(`/discovery/posts/${id}`,window.location.origin).href;try{await navigator.clipboard.writeText(url);setMessage("Đã sao chép liên kết.");}catch{setMessage(url);}}
  return <div className="min-w-0"><button type="button" onClick={share} className={styles.action} aria-label="Sao chép liên kết bài viết"><ShareIcon/>Chia sẻ</button>{message&&<p role="status" className="max-w-full break-all px-3 text-xs text-muted">{message}</p>}</div>;
}
