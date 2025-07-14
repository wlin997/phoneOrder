/*======================================================
  CLIENT  AuthContext.jsx  (cookie version)
======================================================*/
import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
export const AuthContext=createContext(null);
export const useAuth=()=>useContext(AuthContext);
export function AuthProvider({ children }){
  const api = axios.create({ baseURL:"/api", withCredentials:true }); // <- send cookie
  const [user,setUser]=useState(null);
  const [authReady,setAuthReady]=useState(false);
  useEffect(()=>{
    (async()=>{
      try{ const { data } = await api.get("/whoami"); setUser(data); }
      catch{ setUser(null); }
      finally{ setAuthReady(true); }
    })();
  },[]);

  const login = async (email,password,code=null,tmp=null)=>{
    if(tmp){ await api.post("/login/step2",{ tmpToken:tmp, code }); }
    else{ const { data } = await api.post("/login",{ email,password });
      if(data.need2FA) return data; }
    const me = await api.get("/whoami"); setUser(me.data);return{ ok:true };
  };
  const logout=()=> api.post("/logout").then(()=>setUser(null));
  return <AuthContext.Provider value={{ api,user,authReady,login,logout }}>{children}</AuthContext.Provider>;
}