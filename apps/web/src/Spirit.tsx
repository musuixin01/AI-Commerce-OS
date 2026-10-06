import {useId} from "react";
import type {PetState} from "./petActivity";
export default function Spirit({state}:{state:PetState}){
const id=useId().replaceAll(":","");
return <svg className="pet-robot pet-spirit" viewBox="0 0 160 152" aria-hidden="true">
<defs>
<linearGradient id={id+"body"} x1="0%" y1="0%" x2="80%" y2="100%"><stop stopColor="#fffdeb"/><stop offset=".5" stopColor="#f8eee2"/><stop offset="1" stopColor="#ded3f4"/></linearGradient>
<linearGradient id={id+"light"}><stop stopColor="#ffedb5"/><stop offset=".5" stopColor="#fffaf1"/><stop offset="1" stopColor="#cfc1f2"/></linearGradient>
<linearGradient id={id+"eye"} x1="0%" y1="0%" x2="0%" y2="100%"><stop stopColor="#382b32"/><stop offset=".7" stopColor="#514049"/><stop offset="1" stopColor="#bd906c"/></linearGradient>
<radialGradient id={id+"blush"}><stop stopColor="#ffbf96" stopOpacity=".6"/><stop offset="1" stopColor="#ffbf96" stopOpacity="0"/></radialGradient>
<radialGradient id={id+"shadow"}><stop stopColor="#a391c8" stopOpacity=".4"/><stop offset="1" stopColor="#a391c8" stopOpacity="0"/></radialGradient>
</defs>
<ellipse className="spirit-shadow" cx="80" cy="140" rx="42" ry="8" fill={"url(#"+id+"shadow)"}/>
<g className="spirit-orbit"><path d="M38 57H29v3H21v4H15v5H11v8H9v6h4v6h8v5h12M126 72h10v3h9v5h6v7h-2v8h-5v6h-8" fill="none" stroke={"url(#"+id+"light)"} strokeWidth="3.5"/></g>
<g className="pet-body">
<path d="M68 28h24v12h12v18h12v6h19v25h-13v12h-12v15h-8v12H88v-12H73v13H59v-7H49v-17H37V88H24V71h13V59h16V46h15Z" fill={"url(#"+id+"body)"} stroke="#eee5dc" strokeWidth="1" strokeLinejoin="round"/>
<path d="M68 29h24v12H68ZM53 46h15v13H53ZM37 60h16v12H37ZM25 73h12v14H25ZM116 65h18v12h-18Z" fill="#fffde9" opacity=".9"/>
<path d="M38 89h12v16H38ZM50 106h11v16H50ZM88 116h14v12H88ZM105 99h16v13h-16Z" fill="#cbbdeb" opacity=".65"/>
<path d="M61 115h12v13H61ZM94 103h16v13H94Z" fill="#ffedbc" opacity=".8"/>
<ellipse cx="57" cy="95" rx="17" ry="14" fill={"url(#"+id+"blush)"}/><ellipse cx="101" cy="95" rx="17" ry="14" fill={"url(#"+id+"blush)"}/>
<g className="spirit-eyes">{state==="done"?<path d="m59 82 4-4 4 4m24 0 4-4 4 4" fill="none" stroke="#52404a" strokeWidth="3" strokeLinecap="round"/>:<g fill={"url(#"+id+"eye)"}><path d="M59 72h7v2h2v17h-2v2h-7v-2h-1V74h1ZM92 72h7v2h2v17h-2v2h-7v-2h-1V74h1Z"/><path d="M64 75h3v3h-3Zm33 0h3v3h-3Z" fill="#fff"/></g>}</g>
</g>
<g className="spirit-orbit"><path d="M20 93h8v5h12v5h14v5h18v4h30v-3h19v-5h13v-5h10" fill="none" stroke={"url(#"+id+"light)"} strokeWidth="3.5"/><path className="spirit-orbit-trail" d="M20 93h8v5h12v5h14v5h18v4h30v-3h19v-5h13v-5h10" fill="none" stroke="#a68ac9" strokeWidth="2.5" strokeDasharray="9 150"/></g>
<g className="spirit-sparkle"><path d="M121 33h7v6h5v7h-5v6h-7v-6h-5v-7h5Z" fill={"url(#"+id+"light)"} stroke="#f5eae3"/><rect x="16" y="100" width="4" height="4" fill="#f5dca8"/><rect x="138" y="114" width="3" height="3" fill="#c7b5e5"/></g>
{state==="waiting"&&<g><rect x="119" y="87" width="21" height="23" rx="5" fill="#fff" stroke="#c8bfba"/><path d="M125 94h9m-9 4h7m-7 4h5" stroke="#8d7c76" strokeWidth="1.5"/></g>}
{state==="error"&&<g><circle cx="130" cy="96" r="10" fill="#fff" stroke="#b9aaa5"/><path d="M130 90v7m0 3v1" stroke="#695955" strokeWidth="2"/></g>}
</svg>;}
