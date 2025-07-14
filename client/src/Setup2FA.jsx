/*======================================================
  CLIENT  Setup2FA.jsx
======================================================*/
import React,{useState} from "react"; import { useAuth } from "./AuthContext.jsx";
export default function Setup2FA(){
  const { api } = useAuth(); const [qr,setQr]=useState(null); const [code,setCode]=useState("");
  const begin=async()=>{ const { data } = await api.post("/2fa/setup"); setQr(data.qr); };
  const enable=async()=>{ await api.post("/2fa/enable",{ code }); alert("2FA enabled!"); };
  return <div className="p-8 space-y-4 max-w-md mx-auto">
    {!qr? <button onClick={begin} className="bg-cyan-600 text-white px-4 py-2 rounded">Generate QR</button>
      : (<>
        <img src={qr} alt="scan" className="mx-auto" />
        <input className="border p-2 w-full text-center" value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter 6‑digit" />
        <button onClick={enable} className="w-full bg-cyan-600 text-white py-2 rounded">Enable 2FA</button>
      </>)}
  </div>;
}