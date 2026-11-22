const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Dashboard-dptQbixk.js","assets/rolldown-runtime-hePW80VL.js","assets/vendor-icons-9H8GlSD6.js","assets/vendor-react-DT2hpzf0.js","assets/vendor-query-Df25QAQF.js","assets/utils-CwksTKT1.js","assets/i18nInstance-DuAUdJZQ.js","assets/api-BcgVWc35.js","assets/PageContainer-C2yqQgo5.js","assets/PageHeader-B8qGqQTP.js","assets/Breadcrumb-Cq37TMCm.js","assets/shared-JVwgJqZk.js","assets/useHasPerm-BGnxbyRp.js","assets/useStatusFlash-B40ac3f7.js","assets/AllOnus-CMzTLPsj.js","assets/ftthTree-wH5JBsVx.js","assets/LocationPicker-DbPEBnb3.js","assets/ViewOnu-DRKaLA9N.js","assets/AreaChart-BN72_IBu.js","assets/YAxis-DZQ5BwEp.js","assets/AddOnu-CX2NtnnQ.js","assets/OltSettings-BV9QHEnN.js","assets/MikrotikSettings-BeGFFF4N.js","assets/UserManagement-BibI1aRa.js","assets/Customization-B7_Nw5Av.js","assets/RegisterWizard-Bix99N76.js","assets/PortMapEditor-D99T0-QI.js","assets/ProvisionWizard-DZ2ODH60.js","assets/OltConfiguration-ChQGrN2Z.js","assets/MyProfile-QYep9_Vs.js","assets/PushDeviceCard-Wn9E9N1c.js","assets/AlertSettings-BrSin1-M.js","assets/FtthInfrastructure-DFM--91E.js","assets/Templates-Am3dDJ18.js","assets/Tr069Profile-DZr1-L1e.js","assets/ActionLogs-Cl5TNeMz.js","assets/Incidents-Drb6EQBM.js","assets/IncidentDetail-BlLNQY1X.js","assets/AlertHistory-DJkQbRgw.js","assets/Traffic-Bq-NDwOg.js","assets/AiAgentSettings-DE-xcyon.js","assets/CloudflareTunnel-5wAWEBRC.js","assets/GuidePage-Bj6cRnYY.js","assets/UnconfiguredOnus-Cgznym68.js","assets/OnuWizard-BYK9cZxw.js","assets/SystemUpdate-Cnih7vER.js","assets/OltLogs-YBEyFMNT.js","assets/AutoProvision-C1Pk2IK4.js","assets/Reports-BFHURAFM.js","assets/Terminal-D6c0z2LX.js","assets/Terminal-TdnZ7DQy.css"])))=>i.map(i=>d[i]);
import{r as e,t}from"./rolldown-runtime-hePW80VL.js";import{A as n,Cn as r,Ct as i,Dn as a,Dt as o,E as s,F as c,Ft as l,Gt as u,J as d,Kt as f,M as p,Nn as m,Ot as h,P as g,Pn as _,T as v,Ut as y,W as b,Xt as x,Yt as S,a as C,at as ee,b as te,d as w,dn as ne,fn as re,gn as ie,hn as T,i as ae,jt as E,kn as oe,m as se,mt as ce,n as D,nt as le,on as ue,rn as de,s as fe,sn as pe,st as me,t as he,ut as ge,vt as _e,wn as ve,xn as ye,y as be,yn as xe}from"./vendor-icons-9H8GlSD6.js";import{a as Se,c as Ce,f as O,i as we,l as Te,m as Ee,o as k,p as De,r as Oe,s as ke,t as Ae}from"./vendor-react-DT2hpzf0.js";import{_ as je,a as Me,b as Ne,c as Pe,d as Fe,g as Ie,h as A,i as Le,l as Re,m as ze,n as Be,o as j,p as Ve,r as He,s as Ue,t as We,u as Ge,v as Ke,x as qe,y as Je}from"./vendor-query-Df25QAQF.js";import{i as Ye,s as Xe,t as M}from"./utils-CwksTKT1.js";import{r as Ze,t as Qe}from"./i18nInstance-DuAUdJZQ.js";import{n as $e,t as et}from"./api-BcgVWc35.js";import{t as tt}from"./vendor-state-Ct4xmOFW.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var nt=class extends Pe{#e;#t;#n;constructor(e={}){super(),this.config=e,this.#e=new Set,this.#t=new Map,this.#n=0}build(e,t,n){let r=new He({client:e,mutationCache:this,mutationId:++this.#n,options:e.defaultMutationOptions(t),state:n});return this.add(r),r}add(e){this.#e.add(e);let t=rt(e);if(typeof t==`string`){let n=this.#t.get(t);n?n.push(e):this.#t.set(t,[e])}this.notify({type:`added`,mutation:e})}remove(e){if(this.#e.delete(e)){let t=rt(e);if(typeof t==`string`){let n=this.#t.get(t);if(n){if(n.length>1){let t=n.indexOf(e);t!==-1&&n.splice(t,1)}else n[0]===e&&this.#t.delete(t)}}}this.notify({type:`removed`,mutation:e})}canRun(e){let t=rt(e);if(typeof t==`string`){let n=this.#t.get(t)?.find(e=>e.state.status===`pending`);return!n||n===e}return!0}runNext(e){let t=rt(e);return typeof t==`string`?(this.#t.get(t)?.find(t=>t!==e&&t.state.isPaused))?.continue()??Promise.resolve():Promise.resolve()}clear(){j.batch(()=>{this.#e.forEach(e=>{this.notify({type:`removed`,mutation:e})}),this.#e.clear(),this.#t.clear()})}getAll(){return Array.from(this.#e)}find(e){let t={exact:!0,...e};return this.getAll().find(e=>Ve(t,e))}findAll(e={}){return this.getAll().filter(t=>Ve(e,t))}notify(e){j.batch(()=>{this.listeners.forEach(t=>{t(e)})})}resumePausedMutations(){let e=this.getAll().filter(e=>e.state.isPaused);return j.batch(()=>Promise.all(e.map(e=>e.continue().catch(A))))}};function rt(e){return e.options.scope?.id}var it=class extends Pe{#e;constructor(e={}){super(),this.config=e,this.#e=new Map}build(e,t,n){let r=t.queryKey,i=t.queryHash??Fe(r,t),a=this.get(i);return a||(a=new Le({client:e,queryKey:r,queryHash:i,options:e.defaultQueryOptions(t),state:n,defaultOptions:e.getQueryDefaults(r)}),this.add(a)),a}add(e){this.#e.has(e.queryHash)||(this.#e.set(e.queryHash,e),this.notify({type:`added`,query:e}))}remove(e){let t=this.#e.get(e.queryHash);t&&(e.destroy(),t===e&&this.#e.delete(e.queryHash),this.notify({type:`removed`,query:e}))}clear(){j.batch(()=>{this.getAll().forEach(e=>{this.remove(e)})})}get(e){return this.#e.get(e)}getAll(){return[...this.#e.values()]}find(e){let t={exact:!0,...e};return this.getAll().find(e=>ze(t,e))}findAll(e={}){let t=this.getAll();return Object.keys(e).length>0?t.filter(t=>ze(e,t)):t}notify(e){j.batch(()=>{this.listeners.forEach(t=>{t(e)})})}onFocus(){j.batch(()=>{this.getAll().forEach(e=>{e.onFocus()})})}onOnline(){j.batch(()=>{this.getAll().forEach(e=>{e.onOnline()})})}},at=class{#e;#t;#n;#r;#i;#a;#o;#s;constructor(e={}){this.#e=e.queryCache||new it,this.#t=e.mutationCache||new nt,this.#n=e.defaultOptions||{},this.#r=new Map,this.#i=new Map,this.#a=0}mount(){this.#a++,this.#a===1&&(this.#o=Ue.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onFocus())}),this.#s=Me.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onOnline())}))}unmount(){this.#a--,this.#a===0&&(this.#o?.(),this.#o=void 0,this.#s?.(),this.#s=void 0)}isFetching(e){return this.#e.findAll({...e,fetchStatus:`fetching`}).length}isMutating(e){return this.#t.findAll({...e,status:`pending`}).length}getQueryData(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state.data}ensureQueryData(e){let t=this.defaultQueryOptions(e),n=this.#e.build(this,t),r=n.state.data;return r===void 0?this.fetchQuery(e):(e.revalidateIfStale&&n.isStaleByTime(je(t.staleTime,n))&&this.prefetchQuery(t),Promise.resolve(r))}getQueriesData(e){return this.#e.findAll(e).map(({queryKey:e,state:t})=>[e,t.data])}setQueryData(e,t,n){let r=this.defaultQueryOptions({queryKey:e}),i=this.#e.get(r.queryHash)?.state.data,a=Re(t,i);if(a!==void 0)return this.#e.build(this,r).setData(a,{...n,manual:!0})}setQueriesData(e,t,n){return j.batch(()=>this.#e.findAll(e).map(({queryKey:e})=>[e,this.setQueryData(e,t,n)]))}getQueryState(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state}removeQueries(e){let t=this.#e;j.batch(()=>{t.findAll(e).forEach(e=>{t.remove(e)})})}resetQueries(e,t){let n=this.#e;return j.batch(()=>{let r=n.findAll(e),i=new Set(r);return r.forEach(e=>{e.reset()}),this.refetchQueries({type:`active`,predicate:e=>i.has(e)},t)})}cancelQueries(e,t={}){let n={revert:!0,...t},r=j.batch(()=>this.#e.findAll(e).map(e=>e.cancel(n)));return Promise.all(r).then(A).catch(A)}invalidateQueries(e,t={}){return j.batch(()=>(this.#e.findAll(e).forEach(e=>{e.invalidate()}),e?.refetchType===`none`?Promise.resolve():this.refetchQueries({...e,type:e?.refetchType??e?.type??`active`},t)))}refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=j.batch(()=>this.#e.findAll(e).filter(e=>!e.isDisabled()&&!e.isStatic()).map(e=>{let t=e.fetch(void 0,n);return n.throwOnError||(t=t.catch(A)),e.state.fetchStatus===`paused`?Promise.resolve():t}));return Promise.all(r).then(A)}async query(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t),r=n.isStaleByTime(je(t.staleTime,n))?await n.fetch(t):n.state.data,i=t.select;return i?i(r):r}fetchQuery(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t);return n.isStaleByTime(je(t.staleTime,n))?n.fetch(t):Promise.resolve(n.state.data)}prefetchQuery(e){return this.fetchQuery(e).then(A).catch(A)}infiniteQuery(e){return e._type=`infinite`,this.query(e)}fetchInfiniteQuery(e){return e._type=`infinite`,this.fetchQuery(e)}prefetchInfiniteQuery(e){return this.fetchInfiniteQuery(e).then(A).catch(A)}ensureInfiniteQueryData(e){return e._type=`infinite`,this.ensureQueryData(e)}resumePausedMutations(){return Me.isOnline()?this.#t.resumePausedMutations():Promise.resolve()}getQueryCache(){return this.#e}getMutationCache(){return this.#t}getDefaultOptions(){return this.#n}setDefaultOptions(e){this.#n=e}setQueryDefaults(e,t){this.#r.set(Ge(e),{queryKey:e,defaultOptions:t})}getQueryDefaults(e){let t=[...this.#r.values()],n={};return t.forEach(t=>{Ie(e,t.queryKey)&&Object.assign(n,t.defaultOptions)}),n}setMutationDefaults(e,t){this.#i.set(Ge(e),{mutationKey:e,defaultOptions:t})}getMutationDefaults(e){let t=[...this.#i.values()],n={};return t.forEach(t=>{Ie(e,t.mutationKey)&&Object.assign(n,t.defaultOptions)}),n}defaultQueryOptions(e){if(e._defaulted)return e;let t={...this.#n.queries,...this.getQueryDefaults(e.queryKey),...e,_defaulted:!0};return t.queryHash||=Fe(t.queryKey,t),t.refetchOnReconnect===void 0&&(t.refetchOnReconnect=t.networkMode!==`always`),t.throwOnError===void 0&&(t.throwOnError=!!t.suspense),!t.networkMode&&t.persister&&(t.networkMode=`offlineFirst`),t.queryFn===Ke&&(t.enabled=!1),t}defaultMutationOptions(e){return e?._defaulted?e:{...this.#n.mutations,...e?.mutationKey&&this.getMutationDefaults(e.mutationKey),...e,_defaulted:!0}}clear(){this.#e.clear(),this.#t.clear()}},ot=(e,t,n,r)=>{let i=[n,{code:t,...r||{}}];if(e?.services?.logger?.forward)return e.services.logger.forward(i,`warn`,`react-i18next::`,!0);pt(i[0])&&(i[0]=`react-i18next:: ${i[0]}`),e?.services?.logger?.warn?e.services.logger.warn(...i):console?.warn&&console.warn(...i)},st={},ct=(e,t,n,r)=>{pt(n)&&st[n]||(pt(n)&&(st[n]=new Date),ot(e,t,n,r))},lt=(e,t)=>()=>{if(e.isInitialized)t();else{let n=()=>{setTimeout(()=>{e.off(`initialized`,n)},0),t()};e.on(`initialized`,n)}},ut=(e,t,n)=>{e.loadNamespaces(t,lt(e,n))},dt=(e,t,n,r)=>{if(pt(n)&&(n=[n]),e.options.preload&&e.options.preload.indexOf(t)>-1)return ut(e,n,r);n.forEach(t=>{e.options.ns.indexOf(t)<0&&e.options.ns.push(t)}),e.loadLanguages(t,lt(e,r))},ft=(e,t,n={})=>!t.languages||!t.languages.length?(ct(t,`NO_LANGUAGES`,`i18n.languages were undefined or empty`,{languages:t.languages}),!0):t.hasLoadedNamespace(e,{lng:n.lng,precheck:(t,r)=>{if(n.bindI18n&&n.bindI18n.indexOf(`languageChanging`)>-1&&t.services.backendConnector.backend&&t.isLanguageChangingTo&&!r(t.isLanguageChangingTo,e))return!1}}),pt=e=>typeof e==`string`,mt=e=>typeof e==`object`&&!!e,N=e(_()),ht=(0,N.createContext)(),gt=class{constructor(){this.usedNamespaces={}}addUsedNamespaces(e){e.forEach(e=>{this.usedNamespaces[e]||(this.usedNamespaces[e]=!0)})}getUsedNamespaces(){return Object.keys(this.usedNamespaces)}},_t=t((e=>{var t=_();function n(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var r=typeof Object.is==`function`?Object.is:n,i=t.useState,a=t.useEffect,o=t.useLayoutEffect,s=t.useDebugValue;function c(e,t){var n=t(),r=i({inst:{value:n,getSnapshot:t}}),c=r[0].inst,u=r[1];return o(function(){c.value=n,c.getSnapshot=t,l(c)&&u({inst:c})},[e,n,t]),a(function(){return l(c)&&u({inst:c}),e(function(){l(c)&&u({inst:c})})},[e]),s(n),n}function l(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!r(e,n)}catch{return!0}}function u(e,t){return t()}var d=typeof window>`u`||window.document===void 0||window.document.createElement===void 0?u:c;e.useSyncExternalStore=t.useSyncExternalStore===void 0?d:t.useSyncExternalStore})),vt=t(((e,t)=>{t.exports=_t()})),yt=vt(),bt={t:(e,t)=>{if(pt(t))return t;if(mt(t)&&pt(t.defaultValue))return t.defaultValue;if(typeof e==`function`)return``;if(Array.isArray(e)){let t=e[e.length-1];return typeof t==`function`?``:t}return e},ready:!1},xt=()=>()=>{},P=(e,t={})=>{let{i18n:n}=t,{i18n:r,defaultNS:i}=(0,N.useContext)(ht)||{},a=n||r||Qe();a&&!a.reportNamespaces&&(a.reportNamespaces=new gt),a||ct(a,`NO_I18NEXT_INSTANCE`,`useTranslation: You will need to pass in an i18next instance by using initReactI18next`);let o=(0,N.useMemo)(()=>({...Ze(),...a?.options?.react,...t}),[a,t]),{useSuspense:s,keyPrefix:c}=o,l=e||i||a?.options?.defaultNS,u=pt(l)?[l]:l||[`translation`],d=(0,N.useMemo)(()=>u,u);a?.reportNamespaces?.addUsedNamespaces?.(d);let f=(0,N.useRef)(0),p=(0,N.useCallback)(e=>{if(!a)return xt;let{bindI18n:t,bindI18nStore:n}=o,r=()=>{f.current+=1,e()};return t&&a.on(t,r),n&&a.store.on(n,r),()=>{t&&t.split(` `).forEach(e=>a.off(e,r)),n&&n.split(` `).forEach(e=>a.store.off(e,r))}},[a,o]),m=(0,N.useRef)(),h=(0,N.useCallback)(()=>{if(!a)return bt;let e=!!(a.isInitialized||a.initializedStoreOnce)&&d.every(e=>ft(e,a,o)),n=t.lng||a.language,r=f.current,i=m.current;if(i&&i.ready===e&&i.lng===n&&i.keyPrefix===c&&i.revision===r)return i;let s={t:a.getFixedT(n,o.nsMode===`fallback`?d:d[0],c),ready:e,lng:n,keyPrefix:c,revision:r};return m.current=s,s},[a,d,c,o,t.lng]),[g,_]=(0,N.useState)(0),{t:v,ready:y}=(0,yt.useSyncExternalStore)(p,h,h);(0,N.useEffect)(()=>{if(a&&!y&&!s){let e=()=>_(e=>e+1);t.lng?dt(a,t.lng,d,e):ut(a,d,e)}},[a,t.lng,d,y,s,g]);let b=a||{},x=(0,N.useRef)(null),S=(0,N.useRef)(),C=e=>{let t=Object.getOwnPropertyDescriptors(e);t.__original&&delete t.__original;let n=Object.create(Object.getPrototypeOf(e),t);if(!Object.prototype.hasOwnProperty.call(n,`__original`))try{Object.defineProperty(n,"__original",{value:e,writable:!1,enumerable:!1,configurable:!1})}catch{}return n},ee=(0,N.useMemo)(()=>{let e=b,t=e?.language,n=e;e&&(x.current&&x.current.__original===e&&S.current===t?n=x.current:(n=C(e),x.current=n,S.current=t));let r=!y&&!s?(...e)=>(ct(a,`USE_T_BEFORE_READY`,`useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t.`),v(...e)):v,i=[r,n,y];return i.t=r,i.i18n=n,i.ready=y,i},[v,b,y,b.resolvedLanguage,b.language,b.languages]);if(a&&s&&!y)throw new Promise(e=>{let n=()=>e();t.lng?dt(a,t.lng,d,n):ut(a,d,n)});return ee},St=De(),F=qe(),Ct=4e3,wt=4,Tt=null;function I(e,t=`info`,n=Ct){Tt?.({type:t,message:e,duration:n})}I.success=e=>I(e,`success`),I.error=e=>I(e,`error`,5e3),I.warning=e=>I(e,`warning`),I.info=e=>I(e,`info`);var Et={success:(0,F.jsx)(pe,{size:18,className:`text-success`}),error:(0,F.jsx)(de,{size:18,className:`text-danger`}),warning:(0,F.jsx)(w,{size:18,className:`text-warning`}),info:(0,F.jsx)(h,{size:18,className:`text-accent`})},Dt={success:`border-success/30 bg-success/10`,error:`border-danger/30 bg-danger/10`,warning:`border-warning/30 bg-warning/10`,info:`border-accent/30 bg-accent/10`};function Ot(){let[e,t]=(0,N.useState)([]),n=(0,N.useRef)({}),r=(0,N.useCallback)(e=>{t(t=>t.map(t=>t.id===e?{...t,exiting:!0}:t)),setTimeout(()=>{t(t=>t.filter(t=>t.id!==e)),delete n.current[e]},250)},[]),i=(0,N.useCallback)(e=>{t(t=>{if(t.find(t=>t.type===e.type&&t.message===e.message&&!t.exiting))return t;let i=`${e.type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,a=e.duration||Ct;n.current[i]=setTimeout(()=>r(i),a);let o=[...t,{...e,id:i}];return o.length<=wt?o:(o.slice(0,o.length-wt).forEach(e=>{clearTimeout(n.current[e.id]),delete n.current[e.id]}),o.slice(o.length-wt))})},[r]);return(0,N.useEffect)(()=>(Tt=i,()=>{Tt=null}),[i]),(0,N.useEffect)(()=>()=>{Object.values(n.current).forEach(clearTimeout)},[]),(0,F.jsx)(`div`,{className:`fixed top-20 left-4 right-4 sm:left-auto sm:w-full max-w-sm z-[9999] flex flex-col gap-2 pointer-events-none`,children:e.map(e=>(0,F.jsxs)(`div`,{className:M(`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl`,`shadow-lg transition-all duration-250`,Dt[e.type],e.exiting?`opacity-0 translate-x-4`:`animate-slide-in opacity-100`),children:[(0,F.jsx)(`span`,{className:`flex-shrink-0`,children:Et[e.type]}),(0,F.jsx)(`span`,{className:`text-sm font-medium flex-1 text-tx1`,children:e.message}),(0,F.jsx)(`button`,{onClick:()=>r(e.id),className:`flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`,children:(0,F.jsx)(D,{size:14})})]},e.id))})}var kt=null;function At(e){return kt?kt(e):Promise.resolve(window.confirm(e.message))}function jt(){let[e,t]=(0,N.useState)(!1),[n,r]=(0,N.useState)({title:``,message:``}),[i,a]=(0,N.useState)(null);(0,N.useEffect)(()=>(kt=e=>(r(e),t(!0),new Promise(e=>a(()=>e))),()=>{kt=null}),[]);let o=e=>{t(!1),i?.(e)};if(!e)return null;let s=n.variant===`danger`?`bg-danger hover:bg-danger/80 text-white`:n.variant===`warning`?`bg-warning hover:bg-warning/80 text-black`:`bg-accent hover:bg-accent-hover text-white`;return(0,F.jsxs)(`div`,{className:`fixed inset-0 z-[9998] flex items-center justify-center p-4`,children:[(0,F.jsx)(`div`,{className:`modal-overlay`,onClick:()=>o(!1)}),(0,F.jsxs)(`div`,{className:`relative glass-card p-6 w-full max-w-md animate-fade-in`,children:[(0,F.jsx)(`button`,{onClick:()=>o(!1),className:`absolute top-4 right-4 text-tx3 hover:text-tx1`,children:(0,F.jsx)(D,{size:18})}),(0,F.jsxs)(`div`,{className:`flex items-center gap-3 mb-4`,children:[(0,F.jsx)(`div`,{className:M(`w-10 h-10 rounded-xl flex items-center justify-center`,n.variant===`danger`?`bg-danger/15 text-danger`:`bg-warning/15 text-warning`),children:(0,F.jsx)(w,{size:20})}),(0,F.jsx)(`h3`,{className:`text-lg font-semibold`,children:n.title})]}),(0,F.jsx)(`p`,{className:`text-tx2 text-sm mb-6`,children:n.message}),(0,F.jsxs)(`div`,{className:`flex justify-end gap-3`,children:[(0,F.jsx)(`button`,{onClick:()=>o(!1),className:`px-4 py-2 rounded-xl text-sm hover:bg-glass transition-colors`,children:n.cancelLabel||`Cancel`}),(0,F.jsx)(`button`,{onClick:()=>o(!0),className:M(`px-4 py-2 rounded-xl text-sm font-medium transition-all`,s),children:n.confirmLabel||`Confirm`})]})]})]})}var L=tt(e=>({user:null,loading:!0,error:null,fetchUser:async()=>{try{e({loading:!0,error:null});let{user:t}=await $e.me();e({user:t,loading:!1})}catch{e({user:null,loading:!1})}},login:async(t,n)=>{try{e({error:null,errorCode:void 0,errorData:void 0});let{user:r}=await $e.login(t,n);return e({user:r}),!0}catch(t){return e({error:t instanceof Error?t.message:`Login failed`,errorCode:t instanceof et?t.errorCode:void 0,errorData:t instanceof et?t.data:void 0}),!1}},logout:async()=>{e({user:null}),$e.logout().catch(()=>{})}})),Mt=`theme`,Nt=[`dark`,`light`,`system`],Pt=()=>window.matchMedia(`(prefers-color-scheme: light)`);function Ft(e){return e===`system`?Pt().matches?`light`:`dark`:e}function It(e,t=!1){let n=document.documentElement,r=()=>n.classList.toggle(`light`,e===`light`),i=n.classList.contains(`light`)!==(e===`light`),a=document,o=window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(!t||!i||o||!a.startViewTransition){r();return}n.classList.add(`theme-switching`);let s=()=>n.classList.remove(`theme-switching`);a.startViewTransition(r).finished.then(s,s)}function Lt(e){L.getState().user&&fetch(`/api/profile`,{method:`POST`,headers:{"Content-Type":`application/json`},credentials:`include`,body:JSON.stringify({theme:e})}).catch(()=>{})}var Rt=tt((e,t)=>({theme:`dark`,resolved:`dark`,set:(t,n)=>{Nt.includes(t)||(t=`system`);let r=Ft(t);It(r,!0),localStorage.setItem(Mt,t),e({theme:t,resolved:r}),n?.persist!==!1&&Lt(t)},toggle:()=>{let e=t().resolved===`light`?`dark`:`light`;t().set(e)}}));function zt(){let e=localStorage.getItem(Mt),t=e&&Nt.includes(e)?e:`system`,n=Ft(t);It(n),Rt.setState({theme:t,resolved:n}),Pt().addEventListener(`change`,()=>{let{theme:e}=Rt.getState();if(e!==`system`)return;let t=Ft(`system`);It(t,!0),Rt.setState({resolved:t})})}var Bt=[{labelKey:`nav.dashboard`,icon:(0,F.jsx)(i,{size:20}),path:`/dashboard`,permission:`view_dashboard`},{labelKey:`nav.onu`,icon:(0,F.jsx)(b,{size:20}),permission:`view_dashboard`,children:[{labelKey:`nav.allOnus`,path:`/dashboard/onus`},{labelKey:`nav.unconfigured`,path:`/dashboard/onus/unconfigured`,permission:`add_onu`},{labelKey:`nav.provision`,path:`/dashboard/onus/provision`,permission:`add_onu`},{labelKey:`nav.preconfig`,path:`/dashboard/onus/pre-config`,permission:`add_onu`},{labelKey:`nav.registerWizard`,path:`/dashboard/onus/register`,permission:`add_onu`}]},{labelKey:`nav.templates`,icon:(0,F.jsx)(y,{size:20}),permission:`manage_templates`,children:[{labelKey:`nav.templates`,path:`/dashboard/templates`,permission:`manage_templates`},{labelKey:`nav.tr069Profile`,path:`/dashboard/templates/tr069-profile`,permission:`manage_tr069`}]},{labelKey:`nav.traffic`,icon:(0,F.jsx)(m,{size:20}),path:`/dashboard/traffic`,permission:`view_dashboard`},{labelKey:`nav.incidents`,icon:(0,F.jsx)(s,{size:20}),path:`/dashboard/incidents`,permission:`view_dashboard`},{labelKey:`nav.infrastructure`,icon:(0,F.jsx)(p,{size:20}),permission:`view_dashboard`,children:[{labelKey:`nav.oltSettings`,path:`/dashboard/settings/olts`,permission:`settings_ip_olts`},{labelKey:`nav.mikrotik`,path:`/dashboard/settings/mikrotik`,permission:`settings_ip_olts`},{labelKey:`nav.autoProvision`,path:`/dashboard/settings/auto-provision`,permission:`settings_ip_olts`},{labelKey:`nav.ftthOverview`,path:`/dashboard/ftth`,permission:`view_dashboard`},{labelKey:`nav.ponPorts`,path:`/dashboard/ftth?tab=pon`,permission:`view_dashboard`},{labelKey:`nav.otb`,path:`/dashboard/ftth?tab=otb`,permission:`view_dashboard`},{labelKey:`nav.odc`,path:`/dashboard/ftth?tab=odc`,permission:`view_dashboard`},{labelKey:`nav.odp`,path:`/dashboard/ftth?tab=odp`,permission:`view_dashboard`},{labelKey:`nav.ftthMap`,path:`/dashboard/ftth?tab=map`,permission:`view_dashboard`}]},{labelKey:`nav.system`,icon:(0,F.jsx)(v,{size:20}),permission:void 0,children:[{labelKey:`nav.customization`,path:`/dashboard/customization`,permission:`customization`},{labelKey:`nav.users`,path:`/dashboard/users`,permission:`manage_users`},{labelKey:`nav.alertSettings`,path:`/dashboard/settings/alerts`,permission:`customization`},{labelKey:`nav.cloudflare`,path:`/dashboard/settings/cloudflare`,permission:`super_admin`},{labelKey:`nav.aiAgent`,path:`/dashboard/settings/ai`,permission:`super_admin`},{labelKey:`nav.systemUpdate`,path:`/dashboard/settings/update`,permission:`super_admin`},{labelKey:`nav.alertHistory`,path:`/dashboard/alerts/history`,permission:`view_dashboard`}]},{labelKey:`nav.guide`,icon:(0,F.jsx)(ye,{size:20}),path:`/dashboard/guide`},{labelKey:`nav.activityLog`,icon:(0,F.jsx)(c,{size:20}),path:`/dashboard/logs`,permission:`manage_users`},{labelKey:`nav.oltLogs`,icon:(0,F.jsx)(me,{size:20}),path:`/dashboard/olt-logs`,permission:`view_dashboard`},{labelKey:`nav.reports`,icon:(0,F.jsx)(y,{size:20}),path:`/dashboard/reports`,permission:`view_onus`},{labelKey:`nav.terminal`,icon:(0,F.jsx)(be,{size:20}),path:`/dashboard/terminal`,permission:`olt_terminal`}];function Vt(e){if(!e)return[];let t=new Set(e.permissions||[]),n=n=>!n||e.is_super_admin?!0:n===`super_admin`?t.has(`all_olt`):t.has(`all_olt`)?!0:t.has(n),r=Bt.map(e=>({...e,children:e.children?.map(e=>({...e}))}));return r=r.filter(e=>n(e.permission)?!e.children||e.children.some(e=>n(e.permission)):!1),r}function Ht({collapsed:e,mobileOpen:t,onToggle:n,onMobileClose:r}){let{t:i}=P(),{user:a}=L(),o=Te(),s=a?.sidebar_name||`Salfanet NMS`,c=new Set(a?.permissions||[]),l=e=>!e||a?.is_super_admin?!0:e===`super_admin`?c.has(`all_olt`):c.has(`all_olt`)?!0:c.has(e),u=Vt(a),[d,f]=(0,N.useState)(()=>{let e={},t=window.location.pathname;for(let n of u)n.children?.some(e=>t.startsWith(e.path.split(`?`)[0]))&&(e[n.labelKey]=!0);return e}),p=e=>{f(t=>({...t,[e]:!t[e]}))},m=t||!e;return(0,F.jsxs)(F.Fragment,{children:[t&&(0,F.jsx)(`div`,{className:`fixed inset-0 bg-black/50 z-40 lg:hidden`,onClick:r}),(0,F.jsxs)(`aside`,{className:M(`sidebar-panel fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out`,`bg-surface/95 backdrop-blur-xl border-r border-brd`,e?`lg:w-[70px]`:`lg:w-[260px]`,`w-[260px]`,t?`sidebar-open`:`sidebar-closed`),children:[(0,F.jsxs)(`div`,{className:M(`flex items-center h-16 px-4 border-b border-brd`,m?`justify-between`:`justify-center`),children:[m?(0,F.jsxs)(`div`,{className:`flex items-center gap-2.5 min-w-0`,children:[(0,F.jsx)(`div`,{className:M(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,F.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,F.jsx)(he,{size:18,className:`text-white`})}),(0,F.jsx)(`span`,{className:`text-lg font-bold tracking-tight truncate`,children:s})]}):(0,F.jsx)(`div`,{className:M(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,F.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,F.jsx)(he,{size:18,className:`text-white`})}),m&&(0,F.jsx)(`button`,{onClick:n,className:`p-1.5 rounded-lg hover:bg-glass transition-colors max-lg:hidden flex-shrink-0`,children:(0,F.jsx)(re,{size:18})}),m&&(0,F.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass transition-colors lg:hidden flex-shrink-0`,children:(0,F.jsx)(D,{size:18})})]}),!m&&(0,F.jsx)(`button`,{onClick:n,className:`hidden lg:flex items-center justify-center w-full py-2 text-tx3 hover:text-tx1 hover:bg-glass transition-colors border-b border-brd`,children:(0,F.jsx)(ne,{size:18})}),(0,F.jsx)(`nav`,{className:`flex-1 overflow-y-auto py-4 px-3`,children:u.map(e=>(0,F.jsx)(`div`,{className:`mb-1`,children:e.path?(0,F.jsxs)(Oe,{to:e.path,onClick:r,title:m?void 0:i(e.labelKey),className:({isActive:e})=>M(`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,e?`bg-accent/15 text-accent border border-accent/20`:`text-tx2 hover:text-tx1 hover:bg-glass`,!m&&`justify-center px-2`),children:[e.icon,m&&(0,F.jsx)(`span`,{children:i(e.labelKey)})]}):(0,F.jsxs)(F.Fragment,{children:[(0,F.jsxs)(`button`,{onClick:()=>{let t=e.children?.filter(e=>l(e.permission))||[];!m&&t.length?(o(t[0].path),r()):p(e.labelKey)},title:m?void 0:i(e.labelKey),className:M(`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,`text-tx2 hover:text-tx1 hover:bg-glass`,!m&&`justify-center px-2`),children:[e.icon,m&&(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`span`,{className:`flex-1 text-left`,children:i(e.labelKey)}),d[e.labelKey]?(0,F.jsx)(T,{size:16}):(0,F.jsx)(ne,{size:16})]})]}),m&&d[e.labelKey]&&e.children&&(0,F.jsx)(`div`,{className:`ml-4 mt-1 space-y-0.5 animate-fade-in`,children:e.children.filter(e=>l(e.permission)).map(e=>(0,F.jsxs)(Oe,{to:e.path,onClick:r,className:({isActive:e})=>M(`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all`,e?`bg-accent/10 text-accent`:`text-tx3 hover:text-tx2 hover:bg-glass`),children:[(0,F.jsx)(`div`,{className:`w-1.5 h-1.5 rounded-full bg-current opacity-50`}),(0,F.jsx)(`span`,{children:i(e.labelKey)})]},e.path))})]})},e.labelKey))}),m&&(0,F.jsxs)(`div`,{className:`px-4 py-3 border-t border-brd space-y-2`,children:[(0,F.jsxs)(`a`,{href:`https://saweria.co/salfanetradius`,target:`_blank`,rel:`noopener noreferrer`,className:`flex items-center gap-2 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors`,children:[(0,F.jsx)(E,{size:13,className:`fill-current`}),(0,F.jsx)(`span`,{children:`Dukung Project — Saweria`})]}),(0,F.jsxs)(`div`,{className:`text-xs text-tx3`,children:[s,` v2.0`]})]})]})]})}var Ut=e(Ee(),1),Wt={baseUrl:``,reconnect:!0,maxRetries:10,pingInterval:3e4};function Gt(e,t={}){let n={...Wt,...t},[r,i]=(0,N.useState)(null),[a,o]=(0,N.useState)(!1),[s,c]=(0,N.useState)(!1),l=(0,N.useRef)(null),u=(0,N.useRef)(0),d=(0,N.useRef)(null),f=(0,N.useRef)(null),p=(0,N.useRef)(!0),m=(0,N.useRef)(0),h=(0,N.useCallback)(()=>{if(n.baseUrl)return`${n.baseUrl}${e}`;let t=window.location.protocol===`https:`?`wss:`:`ws:`,r=window.location.hostname,i=window.location.port;return i===``||i===`80`||i===`443`?`${t}//${r}${e}`:`${t}//${r}:${window.__WS_PORT__||`8765`}${e}`},[e,n.baseUrl]),g=(0,N.useCallback)(async()=>{try{let e=await fetch(`/api/ws-token`,{credentials:`include`});if(e.ok)return(await e.json()).token||null}catch{}return null},[]),_=(0,N.useCallback)(()=>{d.current&&=(clearInterval(d.current),null),f.current&&=(clearTimeout(f.current),null),l.current&&=(l.current.onclose=null,l.current.close(),null)},[]),v=(0,N.useCallback)(async()=>{if(!p.current)return;let e=l.current;if(e&&e.readyState===WebSocket.CONNECTING)return;_();let t=++m.current,r=await g();if(!p.current||!r||t!==m.current)return;let a=h(),s=`${a}${a.includes(`?`)?`&`:`?`}token=${encodeURIComponent(r)}`,y=new WebSocket(s);l.current=y;let b=setTimeout(()=>{y.readyState===WebSocket.CONNECTING&&y.close()},1e4);y.addEventListener(`open`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`error`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`close`,()=>clearTimeout(b),{once:!0}),y.onopen=()=>{p.current&&(o(!0),c(!1),u.current=0,d.current=setInterval(()=>{y.readyState===WebSocket.OPEN&&y.send(`ping`)},n.pingInterval))},y.onmessage=e=>{if(p.current)try{let t=JSON.parse(e.data);if(t.event===`server_ping`){y.readyState===WebSocket.OPEN&&y.send(`pong`);return}t.event!==`pong`&&i(t)}catch{}},y.onclose=()=>{if(p.current&&(o(!1),d.current&&=(clearInterval(d.current),null),n.reconnect&&u.current<n.maxRetries)){c(!0);let e=Math.min(1e3*2**u.current,3e4);u.current+=1,f.current=setTimeout(()=>{p.current&&v()},e)}},y.onerror=()=>{}},[h,_,g,n.reconnect,n.maxRetries,n.pingInterval]);return(0,N.useEffect)(()=>(p.current=!0,v(),()=>{p.current=!1,_()}),[v,_]),{lastMessage:r,isConnected:a,isReconnecting:s,send:(0,N.useCallback)(e=>{l.current?.readyState===WebSocket.OPEN&&l.current.send(e)},[]),disconnect:(0,N.useCallback)(()=>{p.current=!1,_(),o(!1),c(!1)},[_])}}var Kt=(0,N.createContext)(null);function qt({children:e}){let{lastMessage:t}=Gt(`/ws/dashboard`,{reconnect:!0});return(0,F.jsx)(Kt.Provider,{value:t,children:e})}function Jt(){return(0,N.useContext)(Kt)}var Yt={critical:{icon:(0,F.jsx)(w,{size:14,className:`text-danger`}),color:`text-danger`},warning:{icon:(0,F.jsx)(w,{size:14,className:`text-warning`}),color:`text-warning`},info:{icon:(0,F.jsx)(ie,{size:14,className:`text-info`}),color:`text-info`}},Xt={alarm:{icon:n,labelKey:`topbar.alarms`,badgeClass:`bg-danger`,iconActiveClass:`text-danger`,headerClass:`text-danger`},unregister:{icon:d,labelKey:`topbar.unregOnus`,badgeClass:`bg-warning`,iconActiveClass:`text-warning`,headerClass:`text-warning`},general:{icon:r,labelKey:`topbar.notifications`,badgeClass:`bg-accent`,iconActiveClass:`text-accent`,headerClass:`text-accent`}};function Zt({type:e,notifs:t,unregData:n,onClose:r,onNavigate:i}){let{t:o}=P(),s=Ne(),c=Xt[e].icon,l=We({mutationFn:async e=>fetch(`/api/notifications/${e}/read`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),u=We({mutationFn:async()=>fetch(`/api/notifications/read-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),f=We({mutationFn:async e=>fetch(`/api/notifications/${e}/acknowledge`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),p=We({mutationFn:async()=>fetch(`/api/notifications/acknowledge-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),m=We({mutationFn:async()=>fetch(`/api/notifications/clear`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),h=t.filter(e=>!e.is_read&&!e.resolved).length,g=t.filter(e=>!e.resolved),_=t.filter(e=>e.resolved),v={offline:`offline`,offline_batch:`offline`,dyinggasp:`dyinggasp`,dyinggasp_batch:`dyinggasp`,los:`los`,los_batch:`los`,signal:`los`,signal_drop:`los`,signal_drop_batch:`los`},y=t=>{if(t.is_read||l.mutate(t.id),e===`alarm`){let e=v[t.category];e&&(r(),i(`/dashboard/onus?filter=${e}`))}else e===`unregister`&&(r(),i(`/dashboard/onus/register`))};return(0,F.jsxs)(`div`,{className:`fixed md:absolute left-2 right-2 md:left-auto md:right-0 top-14 md:top-12 w-auto md:w-96 max-h-[80vh] md:max-h-[75vh] rounded-2xl z-50 animate-fade-in overflow-hidden flex flex-col shadow-2xl shadow-black/40 border border-brd`,style:{background:`var(--bg-surface)`,backdropFilter:`blur(20px)`},children:[(0,F.jsxs)(`div`,{className:`flex items-center justify-between px-4 py-3 border-b border-brd`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,F.jsx)(c,{size:16,className:Xt[e].headerClass}),(0,F.jsx)(`span`,{className:`font-semibold text-sm`,children:o(Xt[e].labelKey)}),h>0&&(0,F.jsx)(`span`,{className:M(`px-2 py-0.5 rounded-full text-[10px] font-bold text-white`,Xt[e].badgeClass),children:h})]}),(0,F.jsxs)(`div`,{className:`flex gap-1`,children:[h>0&&(0,F.jsx)(`button`,{onClick:()=>p.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-success transition-colors`,title:o(`topbar.ackAll`),children:(0,F.jsx)(ue,{size:14})}),h>0&&(0,F.jsx)(`button`,{onClick:()=>u.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors`,title:o(`topbar.markAllRead`),children:(0,F.jsx)(ie,{size:14})}),(0,F.jsx)(`button`,{onClick:()=>m.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-danger transition-colors`,title:o(`topbar.clearRead`),children:(0,F.jsx)(se,{size:14})}),(0,F.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1 transition-colors`,title:o(`common.close`),children:(0,F.jsx)(D,{size:14})})]})]}),e===`unregister`&&n&&n.unregistered>0&&(0,F.jsxs)(`div`,{onClick:()=>{r(),i(`/dashboard/onus/register`)},className:`px-4 py-3 bg-warning/10 border-b border-warning/20 cursor-pointer hover:bg-warning/15 transition-colors group`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,F.jsx)(`div`,{className:`w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0`,children:(0,F.jsx)(d,{size:16,className:`text-warning`})}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,F.jsx)(`div`,{className:`text-sm font-medium text-warning`,children:o(`topbar.unregCta`,{count:n.unregistered})}),(0,F.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5`,children:o(`topbar.tapToRegister`)})]}),(0,F.jsx)(a,{size:16,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]}),n.breakdown.slice(0,3).map((e,t)=>(0,F.jsxs)(`div`,{className:`text-xs text-tx3 mt-1.5 pl-10`,children:[e.olt_name,`: `,e.count,` ONU(s)`]},t))]}),e===`alarm`&&n&&n.offline_dyinggasp>0&&(0,F.jsxs)(`div`,{className:`border-b border-brd/50`,children:[n.dyinggasp_count>0&&(0,F.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=dyinggasp`)},className:`px-4 py-2.5 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors group`,children:(0,F.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,F.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0`,children:(0,F.jsx)(w,{size:14,className:`text-warning`})}),(0,F.jsx)(`div`,{className:`flex-1`,children:(0,F.jsx)(`span`,{className:`text-xs font-medium text-warning`,children:o(`topbar.onuDyinggasp`,{count:n.dyinggasp_count})})}),(0,F.jsx)(a,{size:14,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]})}),n.offline_count>0&&(0,F.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=offline`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,F.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,F.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,F.jsx)(C,{size:14,className:`text-danger`})}),(0,F.jsx)(`div`,{className:`flex-1`,children:(0,F.jsx)(`span`,{className:`text-xs font-medium text-danger`,children:o(`topbar.onuOffline`,{count:n.offline_count})})}),(0,F.jsx)(a,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})}),n.los_count>0&&(0,F.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=los`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,F.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,F.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,F.jsx)(de,{size:14,className:`text-danger`})}),(0,F.jsx)(`div`,{className:`flex-1`,children:(0,F.jsx)(`span`,{className:`text-xs font-medium text-danger`,children:o(`topbar.onuLos`,{count:n.los_count})})}),(0,F.jsx)(a,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})})]}),(0,F.jsx)(`div`,{className:`overflow-y-auto flex-1 max-h-[55vh] md:max-h-[50vh] overscroll-contain`,children:g.length===0&&_.length===0?(0,F.jsxs)(`div`,{className:`py-10 text-center`,children:[(0,F.jsx)(c,{size:28,className:`text-tx3/40 mx-auto mb-2`}),(0,F.jsx)(`p`,{className:`text-tx3 text-sm`,children:o(e===`alarm`?`topbar.noAlarms`:e===`unregister`?`topbar.noUnreg`:`topbar.noNotif`)})]}):(0,F.jsxs)(F.Fragment,{children:[g.map(e=>{let t=Yt[e.severity||`info`]||Yt.info,n=e.acknowledged;return(0,F.jsx)(`div`,{onClick:()=>y(e),className:M(`px-4 py-3 border-b border-brd/50 cursor-pointer hover:bg-glass/50 transition-colors group`,!e.is_read&&`bg-accent/5`,n&&`opacity-60`),children:(0,F.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,F.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:t.icon}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,F.jsx)(`span`,{className:`text-sm font-medium truncate`,children:e.title}),n&&(0,F.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,F.jsx)(ue,{size:9}),` ACK`]})]}),(0,F.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-2`,children:e.message.split(`
`)[0]}),(0,F.jsxs)(`div`,{className:`text-[10px] text-tx3/70 mt-1 flex items-center gap-2`,children:[(0,F.jsx)(`span`,{children:e.created_at?new Date(e.created_at).toLocaleString():``}),n&&e.acknowledged_by&&(0,F.jsxs)(`span`,{className:`text-success/70`,children:[`by `,e.acknowledged_by]})]})]}),(0,F.jsxs)(`div`,{className:`flex flex-col items-center gap-1 flex-shrink-0`,children:[!e.is_read&&(0,F.jsx)(`div`,{className:`w-2 h-2 rounded-full bg-accent animate-pulse`}),!n&&(0,F.jsx)(`button`,{onClick:t=>{t.stopPropagation(),f.mutate(e.id)},className:`p-1 rounded hover:bg-success/15 text-tx3 hover:text-success transition-colors opacity-0 group-hover:opacity-100`,title:o(`topbar.acknowledge`),children:(0,F.jsx)(ue,{size:14})})]})]})},e.id)}),_.length>0&&(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`div`,{className:`px-4 py-1.5 bg-glass/30 border-b border-brd/50 text-[10px] font-medium text-tx3 uppercase tracking-wide`,children:o(`topbar.resolved`,{count:_.length})}),_.map(e=>(0,F.jsx)(`div`,{onClick:()=>y(e),className:`px-4 py-2.5 border-b border-brd/50 cursor-pointer hover:bg-glass/30 transition-colors opacity-50`,children:(0,F.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,F.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:(0,F.jsx)(ue,{size:14,className:`text-success`})}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,F.jsx)(`span`,{className:`text-sm font-medium truncate line-through`,children:e.title}),(0,F.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,F.jsx)(ue,{size:9}),` RESOLVED`]})]}),(0,F.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-1`,children:e.message.split(`
`)[0]}),(0,F.jsx)(`div`,{className:`text-[10px] text-tx3/70 mt-1`,children:e.resolved_at?o(`topbar.resolvedAt`,{time:new Date(e.resolved_at).toLocaleString()}):``})]})]})},e.id))]})]})})]})}function Qt({onMenuClick:e}){let{t}=P(),{user:n,logout:i}=L(),{resolved:a,toggle:o}=Rt(),[s,c]=(0,N.useState)(!1),[l,u]=(0,N.useState)(null),d=Ne(),f=Te(),p=(0,N.useRef)(null),m=(0,N.useRef)(null),h=(0,N.useRef)(null),{data:g}=Be({queryKey:[`notifications`],queryFn:async()=>{let e=await fetch(`/api/notifications?limit=50`,{credentials:`include`});return e.ok?e.json():{notifications:[],unread_count:0,alarm_unread:0,unregister_unread:0,general_unread:0}},refetchInterval:1e4}),_=Jt();(0,N.useEffect)(()=>{_&&(_.event===`alert`||_.event===`onu_change`)&&(d.invalidateQueries({queryKey:[`notifications`]}),d.invalidateQueries({queryKey:[`unregistered-count`]}))},[_,d]);let{data:v}=Be({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),y=g?.notifications||[],b=g?.alarm_unread||0,x=g?.unregister_unread||0,S=g?.general_unread||0,C=x+(v?.unregistered||0),w=(0,N.useMemo)(()=>y.filter(e=>e.type===`alarm`),[y]),ne=(0,N.useMemo)(()=>y.filter(e=>e.type===`unregister`),[y]),re=(0,N.useMemo)(()=>y.filter(e=>e.type===`general`),[y]);(0,N.useEffect)(()=>{let e=e=>{p.current&&!p.current.contains(e.target)&&u(null),m.current&&!m.current.contains(e.target)&&!h.current?.contains(e.target)&&c(!1)};return document.addEventListener(`mousedown`,e),()=>document.removeEventListener(`mousedown`,e)},[]);let ie=e=>{f(e)},T=(e,n,r)=>{let i=Xt[e],a=i.icon,o=l===e;return(0,F.jsxs)(`button`,{onClick:()=>u(o?null:e),className:M(`relative p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,o&&`bg-glass`,r),title:t(i.labelKey),"aria-label":t(i.labelKey),children:[(0,F.jsx)(a,{size:18,className:M(`text-tx2 transition-colors`,o&&i.iconActiveClass)}),n>0&&(0,F.jsx)(`div`,{className:M(`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse-once`,i.badgeClass),children:n>99?`99+`:n})]},e)};return(0,F.jsxs)(`header`,{className:`sticky top-0 z-30 h-14 md:h-16 flex items-center justify-between px-3 md:px-6 bg-surface/80 backdrop-blur-xl border-b border-brd transition-colors duration-300`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,F.jsx)(`button`,{onClick:e,className:`p-2 rounded-lg hover:bg-glass transition-colors lg:hidden active:scale-95`,children:(0,F.jsx)(ge,{size:20,className:`text-tx2`})}),(0,F.jsxs)(`div`,{className:`flex items-center gap-1.5 lg:hidden`,children:[(0,F.jsx)(`div`,{className:M(`w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-accent/20 overflow-hidden`,n?.logo_url?`bg-white p-1`:`bg-accent`),children:n?.logo_url?(0,F.jsx)(`img`,{src:n.logo_url,alt:``,className:`w-full h-full object-contain`}):(0,F.jsx)(he,{size:15,className:`text-white`})}),(0,F.jsx)(`span`,{className:`text-sm font-bold tracking-tight`,children:n?.sidebar_name||`Salfanet NMS`})]})]}),(0,F.jsxs)(`div`,{className:`flex items-center gap-1`,children:[(0,F.jsx)(`button`,{onClick:o,className:`hidden sm:inline-flex p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,title:t(a===`light`?`topbar.themeToDark`:`topbar.themeToLight`),children:a===`light`?(0,F.jsx)(ee,{size:18,className:`text-tx2`}):(0,F.jsx)(te,{size:18,className:`text-tx2`})}),(0,F.jsxs)(`div`,{className:`relative flex items-center gap-0.5`,ref:p,children:[T(`alarm`,b),T(`unregister`,C),T(`general`,S,`hidden sm:block`),l===`alarm`&&(0,F.jsx)(Zt,{type:`alarm`,notifs:w,unregData:v,onClose:()=>u(null),onNavigate:ie}),l===`unregister`&&(0,F.jsx)(Zt,{type:`unregister`,notifs:ne,unregData:v,onClose:()=>u(null),onNavigate:ie}),l===`general`&&(0,F.jsx)(Zt,{type:`general`,notifs:re,unregData:v,onClose:()=>u(null),onNavigate:ie})]}),(0,F.jsxs)(`div`,{className:`relative`,ref:m,children:[(0,F.jsxs)(`button`,{onClick:()=>c(!s),className:`flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-glass transition-colors active:scale-95`,children:[(0,F.jsx)(`div`,{className:`w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center ring-1 ring-accent/20`,children:(0,F.jsx)(fe,{size:16,className:`text-accent`})}),(0,F.jsxs)(`div`,{className:`text-left hidden sm:block`,children:[(0,F.jsx)(`div`,{className:`text-sm font-medium leading-tight`,children:n?.full_name||`Admin`}),(0,F.jsx)(`div`,{className:`text-[10px] text-tx3 leading-tight`,children:n?.is_super_admin&&(!n?.role||n.role===`User`)?t(`topbar.superAdmin`):n?.role||`User`})]})]}),s&&(0,Ut.createPortal)((0,F.jsxs)(`div`,{ref:h,style:{position:`fixed`},className:`top-14 right-2 w-52 max-w-[calc(100vw-1rem)] py-1.5 glass-card rounded-xl z-[999] animate-fade-in shadow-2xl shadow-black/20`,children:[(0,F.jsxs)(`div`,{className:`px-4 py-2.5 border-b border-brd`,children:[(0,F.jsx)(`div`,{className:`text-sm font-medium`,children:n?.full_name||`Admin`}),(0,F.jsx)(`div`,{className:`text-xs text-tx3`,children:n?.username||``}),n?.is_super_admin&&(0,F.jsx)(`div`,{className:`text-[10px] text-accent font-medium mt-0.5`,children:t(`topbar.superAdmin`)})]}),(0,F.jsxs)(`button`,{onClick:()=>{c(!1),f(`/dashboard/profile`)},className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,F.jsx)(fe,{size:16,className:`text-tx3`}),` `,t(`topbar.myProfile`)]}),(0,F.jsxs)(`button`,{onClick:()=>{c(!1),u(`general`)},className:`sm:hidden flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,F.jsx)(r,{size:16,className:`text-tx3`}),(0,F.jsx)(`span`,{className:`flex-1 text-left`,children:t(`topbar.notifications`)}),S>0&&(0,F.jsx)(`span`,{className:`px-1.5 min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center`,children:S>99?`99+`:S})]}),(0,F.jsxs)(`button`,{onClick:()=>{o()},className:`sm:hidden flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[a===`light`?(0,F.jsx)(ee,{size:16,className:`text-tx3`}):(0,F.jsx)(te,{size:16,className:`text-tx3`}),t(a===`light`?`topbar.themeToDark`:`topbar.themeToLight`)]}),(0,F.jsx)(`hr`,{className:`border-brd my-1`}),(0,F.jsxs)(`button`,{onClick:()=>i(),className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors`,children:[(0,F.jsx)(ce,{size:16}),` `,t(`topbar.logout`)]})]}),document.body)]})]})]})}function $t(){let{t:e}=P(),[t,n]=(0,N.useState)(navigator.onLine);return(0,N.useEffect)(()=>{let e=()=>n(!0),t=()=>n(!1);return window.addEventListener(`online`,e),window.addEventListener(`offline`,t),()=>{window.removeEventListener(`online`,e),window.removeEventListener(`offline`,t)}},[]),t?null:(0,F.jsxs)(`div`,{className:`fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black text-xs font-medium text-center py-1 flex items-center justify-center gap-1.5`,children:[(0,F.jsx)(C,{size:13}),(0,F.jsx)(`span`,{children:e(`cmp_off.connectionLostDataCan`)})]})}var en={sm:`max-w-md`,md:`max-w-lg`,lg:`max-w-2xl`,xl:`max-w-4xl`};function tn({open:e,onClose:t,title:n,icon:r,children:i,size:a=`md`,footer:o}){return(0,N.useEffect)(()=>{if(!e)return;let n=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,n),()=>document.removeEventListener(`keydown`,n)},[e,t]),e?(0,Ut.createPortal)((0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`div`,{className:`modal-overlay`,onClick:t}),(0,F.jsx)(`div`,{className:`modal-wrapper`,children:(0,F.jsxs)(`div`,{className:M(`relative glass-card w-full flex flex-col rounded-t-2xl md:rounded-2xl`,`max-h-[90dvh] md:max-h-[85dvh] animate-slide-up md:animate-fade-in`,en[a]),onClick:e=>e.stopPropagation(),children:[n&&(0,F.jsxs)(`div`,{className:`section-header sticky top-0 z-10 rounded-t-2xl`,children:[(0,F.jsxs)(`h2`,{className:`section-title`,children:[r,n]}),(0,F.jsx)(`button`,{onClick:t,className:`text-tx3 hover:text-tx1 transition-colors p-1 rounded-lg hover:bg-glass`,children:(0,F.jsx)(D,{size:18})})]}),(0,F.jsx)(`div`,{className:`overflow-y-auto flex-1 p-4 md:p-5`,children:i}),o&&(0,F.jsx)(`div`,{className:`modal-footer justify-end`,children:o})]})})]}),document.body):null}function nn({title:e,icon:t,action:n,children:r,className:i,bodyClassName:a,onClick:o}){return(0,F.jsxs)(`div`,{className:M(`glass-card`,i),onClick:o,role:o?`button`:void 0,tabIndex:o?0:void 0,onKeyDown:o?e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),o())}:void 0,children:[e&&(0,F.jsxs)(`div`,{className:`section-header`,children:[(0,F.jsxs)(`h3`,{className:`section-title`,children:[t,e]}),n]}),(0,F.jsx)(`div`,{className:M(`p-4 md:p-5`,a),children:r})]})}function rn({size:e=`md`,className:t}){return(0,F.jsx)(`div`,{className:M(`spinner`,e===`lg`&&`spinner-lg`,e===`sm`&&`spinner-sm`,t)})}function an({label:e}){return(0,F.jsxs)(`div`,{className:`flex flex-col items-center justify-center py-12`,children:[(0,F.jsx)(_e,{size:28,className:`text-accent animate-spin`}),e&&(0,F.jsx)(`p`,{className:`text-tx3 text-sm mt-3`,children:e})]})}function on({icon:e,title:t,description:n,action:r}){return(0,F.jsxs)(`div`,{className:`empty-state`,children:[e&&(0,F.jsx)(`div`,{className:`empty-state-icon`,children:(0,F.jsx)(e,{size:22})}),(0,F.jsx)(`p`,{className:`empty-state-title`,children:t}),n&&(0,F.jsx)(`p`,{className:`empty-state-desc`,children:n}),r&&(0,F.jsx)(`div`,{className:`mt-4`,children:r})]})}function sn({children:e,className:t,maxHeight:n=`max-h-64`}){return(0,F.jsx)(`div`,{className:M(`code-block`,n,`overflow-y-auto`,t),children:(0,F.jsx)(`pre`,{children:e})})}function cn({tabs:e,active:t,onChange:n,className:r}){return(0,F.jsx)(`div`,{className:M(`flex gap-1 p-1 rounded-lg bg-glass border border-brd w-full sm:w-fit max-w-full overflow-x-auto tab-scroll`,r),children:e.map(e=>(0,F.jsxs)(`button`,{type:`button`,onClick:()=>n(e.key),className:M(`tab-btn inline-flex items-center gap-1.5 flex-shrink-0`,t===e.key&&`tab-btn-active`),children:[e.icon,e.label]},e.key))})}function ln({className:e}){return(0,F.jsx)(`div`,{className:M(`animate-pulse rounded-lg bg-glass`,e)})}var un={primary:`btn-primary`,secondary:`btn-cancel border border-brd`,ghost:`btn-ghost`,danger:`btn-danger`,warning:`btn-warning`,accent:`btn-accent`,icon:`p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass transition-colors active:scale-95`},dn=(0,N.forwardRef)(function({variant:e=`primary`,loading:t=!1,icon:n,disabled:r,className:i,children:a,type:o=`button`,...s},c){return(0,F.jsxs)(`button`,{ref:c,type:o,disabled:r||t,"aria-busy":t||void 0,className:M(un[e],`inline-flex items-center justify-center gap-2`,i),...s,children:[t?(0,F.jsx)(rn,{size:`sm`}):n,a]})}),fn=(0,N.forwardRef)(function({label:e,error:t,helperText:n,icon:r,suffix:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,N.useId)(),d=s||u;return(0,F.jsxs)(`div`,{className:M(`w-full`,o),children:[e&&(0,F.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,F.jsxs)(`div`,{className:`relative`,children:[r&&(0,F.jsx)(`span`,{className:`absolute left-3 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none`,children:r}),(0,F.jsx)(`input`,{ref:l,id:d,className:M(`input-field`,r&&`pl-9`,i&&`pr-10`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c}),i&&(0,F.jsx)(`span`,{className:`absolute right-3 top-1/2 -translate-y-1/2 text-tx3`,children:i})]}),t?(0,F.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,F.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),pn=(0,N.forwardRef)(function({label:e,error:t,helperText:n,options:r,children:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,N.useId)(),d=s||u;return(0,F.jsxs)(`div`,{className:M(`w-full`,o),children:[e&&(0,F.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,F.jsx)(`select`,{ref:l,id:d,className:M(`input-field`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c,children:r?r.map(e=>(0,F.jsx)(`option`,{value:e.value,disabled:e.disabled,children:e.label},e.value)):i}),t?(0,F.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,F.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),mn=(0,N.forwardRef)(function({label:e,error:t,helperText:n,className:r,wrapperClassName:i,id:a,...o},s){let c=(0,N.useId)(),l=a||c;return(0,F.jsxs)(`div`,{className:M(`w-full`,i),children:[e&&(0,F.jsx)(`label`,{htmlFor:l,className:`label-sm block`,children:e}),(0,F.jsx)(`textarea`,{ref:s,id:l,className:M(`input-field`,`h-auto min-h-[80px] py-2.5`,t&&`border-danger`,r),"aria-invalid":!!t||void 0,"aria-describedby":t?`${l}-error`:n?`${l}-helper`:void 0,...o}),t?(0,F.jsx)(`p`,{id:`${l}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,F.jsx)(`p`,{id:`${l}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),hn={ok:`var(--status-ok)`,warn:`var(--status-warn)`,crit:`var(--status-crit)`,idle:`var(--status-idle)`,info:`var(--status-info)`};function gn({items:e,active:t,onSelect:n,className:r,...i}){return(0,F.jsx)(`div`,{role:n?`toolbar`:`list`,"aria-label":i[`aria-label`],className:M(`scroll-row md:flex-wrap md:overflow-visible -mx-3 px-3 md:mx-0 md:px-0`,r),children:e.map(e=>{let r=e.color||hn[e.tone||`idle`],i=t===e.key,a=(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`span`,{className:`status-dot`,"aria-hidden":`true`}),e.icon&&(0,F.jsx)(`span`,{className:`opacity-80`,"aria-hidden":`true`,children:e.icon}),(0,F.jsx)(`span`,{children:e.label}),(0,F.jsx)(`span`,{className:`status-chip-count`,children:e.count})]}),o={"--chip-tone":r};return n?(0,F.jsx)(`button`,{type:`button`,className:`status-chip`,"data-active":i,"aria-pressed":i,title:e.title,style:o,onClick:()=>n(e.key),children:a},e.key):(0,F.jsx)(`span`,{role:`listitem`,className:`status-chip`,"data-active":i,title:e.title,style:o,children:a},e.key)})})}function _n({open:e,onClose:t,title:n,description:r,children:i,footer:a,width:o=420,className:s}){let{t:c}=P(),l=(0,N.useRef)(null);return(0,N.useEffect)(()=>{if(!e)return;let n=document.activeElement,r=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,r),l.current?.focus(),()=>{document.removeEventListener(`keydown`,r),n?.focus?.()}},[e,t]),e?(0,Ut.createPortal)((0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`div`,{className:`sheet-backdrop`,onClick:t,"aria-hidden":`true`}),(0,F.jsxs)(`div`,{ref:l,role:`dialog`,"aria-modal":`true`,"aria-label":typeof n==`string`?n:void 0,tabIndex:-1,className:M(`sheet-panel outline-none`,s),style:{"--sheet-w":`${o}px`},children:[(0,F.jsx)(`div`,{className:`sheet-grip`,"aria-hidden":`true`}),(n||r)&&(0,F.jsxs)(`div`,{className:`flex items-start justify-between gap-3 px-4 pt-3 pb-3 md:px-5 md:pt-5 border-b border-brd`,children:[(0,F.jsxs)(`div`,{className:`min-w-0`,children:[n&&(0,F.jsx)(`h2`,{className:`text-base font-semibold text-tx1 truncate`,children:n}),r&&(0,F.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:r})]}),(0,F.jsx)(`button`,{type:`button`,onClick:t,className:`touch-target -mr-2 -mt-1 p-2 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass flex items-center justify-center`,"aria-label":c(`common.close`),children:(0,F.jsx)(D,{size:18})})]}),(0,F.jsx)(`div`,{className:`flex-1 overflow-y-auto overscroll-contain p-4 md:p-5`,children:i}),a&&(0,F.jsx)(`div`,{className:`border-t border-brd p-3 md:p-4 flex gap-2 justify-end`,children:a})]})]}),document.body):null}function vn(e){let[t,n]=(0,N.useState)(()=>typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(e).matches);return(0,N.useEffect)(()=>{if(typeof window.matchMedia!=`function`)return;let t=window.matchMedia(e),r=()=>n(t.matches);return r(),t.addEventListener?.(`change`,r),()=>t.removeEventListener?.(`change`,r)},[e]),t}var yn=()=>!vn(`(min-width: 768px)`);function bn({actions:e,label:t,title:n,iconOnly:r,className:i}){let{t:a}=P(),o=yn(),[s,c]=(0,N.useState)(!1),l=(0,N.useRef)(null),u=(0,N.useRef)(null),[d,f]=(0,N.useState)(null),p=t||a(`ui.more`),m=e.filter(e=>!e.danger),h=e.filter(e=>e.danger);(0,N.useLayoutEffect)(()=>{if(!s||o||!l.current)return;let e=l.current.getBoundingClientRect();f({top:e.bottom+6,right:Math.max(8,window.innerWidth-e.right)})},[s,o]),(0,N.useEffect)(()=>{if(!s||o)return;let e=e=>{let t=e.target;!u.current?.contains(t)&&!l.current?.contains(t)&&c(!1)},t=e=>{e.key===`Escape`&&c(!1)},n=()=>c(!1);return document.addEventListener(`mousedown`,e),document.addEventListener(`keydown`,t),window.addEventListener(`scroll`,n,!0),window.addEventListener(`resize`,n),()=>{document.removeEventListener(`mousedown`,e),document.removeEventListener(`keydown`,t),window.removeEventListener(`scroll`,n,!0),window.removeEventListener(`resize`,n)}},[s,o]);let g=e=>{e.disabled||(c(!1),e.onClick())},_=(e,t)=>(0,F.jsxs)(`button`,{type:`button`,role:`menuitem`,disabled:e.disabled,onClick:()=>g(e),className:M(`w-full flex items-center gap-3 text-left rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed`,t?`min-h-[48px] px-3 text-[15px]`:`px-3 py-2 text-sm`,e.danger?`text-danger hover:bg-danger/10`:`text-tx1 hover:bg-glass`),children:[e.icon&&(0,F.jsx)(`span`,{className:M(`shrink-0`,e.danger?`text-danger`:`text-tx3`),"aria-hidden":`true`,children:e.icon}),(0,F.jsxs)(`span`,{className:`flex-1 min-w-0`,children:[(0,F.jsx)(`span`,{className:`block truncate`,children:e.label}),e.hint&&(0,F.jsx)(`span`,{className:`block text-xs text-tx3 truncate`,children:e.hint})]})]},e.key),v=e=>(0,F.jsxs)(`div`,{role:`menu`,className:`flex flex-col gap-0.5`,children:[m.map(t=>_(t,e)),h.length>0&&(0,F.jsxs)(F.Fragment,{children:[m.length>0&&(0,F.jsx)(`hr`,{className:`border-brd my-1.5`}),h.map(t=>_(t,e))]})]});return e.length===0?null:(0,F.jsxs)(F.Fragment,{children:[(0,F.jsxs)(`button`,{ref:l,type:`button`,onClick:()=>c(e=>!e),"aria-haspopup":`menu`,"aria-expanded":s,"aria-label":r?p:void 0,title:r?p:void 0,className:M(r?`touch-target p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass inline-flex items-center justify-center`:`btn-cancel border border-brd inline-flex items-center justify-center gap-2`,i),children:[(0,F.jsx)(S,{size:18,"aria-hidden":`true`}),!r&&(0,F.jsx)(`span`,{children:p})]}),s&&o&&(0,F.jsx)(_n,{open:!0,onClose:()=>c(!1),title:n||p,children:v(!0)}),s&&!o&&d&&(0,Ut.createPortal)((0,F.jsxs)(`div`,{ref:u,style:{position:`fixed`,top:d.top,right:d.right},className:`z-[70] w-60 max-h-[70vh] overflow-y-auto p-1.5 rounded-xl border border-brd shadow-2xl shadow-black/30 animate-fade-in`,children:[(0,F.jsx)(`div`,{className:`absolute inset-0 -z-10 rounded-xl`,style:{background:`var(--bg-surface)`}}),v(!1)]}),document.body)]})}function xn({steps:e,current:t,onStepClick:n,className:r}){let{t:i}=P(),a=e.length,o=Math.min(Math.max(t,0),a-1),s=a>1?(o+1)/a*100:100;return(0,F.jsxs)(`nav`,{"aria-label":i(`ui.steps`),className:r,children:[(0,F.jsxs)(`div`,{className:`md:hidden`,children:[(0,F.jsxs)(`div`,{className:`flex items-baseline justify-between gap-2 text-sm`,children:[(0,F.jsx)(`span`,{className:`font-semibold text-tx1 truncate`,children:e[o]?.label}),(0,F.jsx)(`span`,{className:`text-xs text-tx3 num shrink-0`,children:i(`ui.stepOf`,{n:o+1,total:a})})]}),(0,F.jsx)(`div`,{className:`mt-2 h-1.5 rounded-full bg-glass overflow-hidden`,role:`progressbar`,"aria-valuemin":1,"aria-valuemax":a,"aria-valuenow":o+1,children:(0,F.jsx)(`div`,{className:`h-full rounded-full bg-accent transition-[width] duration-300`,style:{width:`${s}%`}})})]}),(0,F.jsx)(`ol`,{className:`hidden md:flex items-center gap-2`,children:e.map((e,t)=>{let r=t<o,i=t===o,s=r&&!!n;return(0,F.jsxs)(`li`,{className:`flex items-center gap-2 min-w-0 flex-1 last:flex-none`,children:[(0,F.jsxs)(`button`,{type:`button`,disabled:!s,onClick:()=>s&&n?.(t),"aria-current":i?`step`:void 0,className:M(`flex items-center gap-2 min-w-0 rounded-lg px-1 py-1`,s&&`hover:bg-glass`),children:[(0,F.jsx)(`span`,{className:M(`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold num border`,r&&`bg-accent text-white border-accent`,i&&`border-accent text-accent bg-accent/10`,!r&&!i&&`border-brd text-tx3`),children:r?(0,F.jsx)(ie,{size:14}):t+1}),(0,F.jsx)(`span`,{className:M(`text-sm truncate`,i?`text-tx1 font-semibold`:`text-tx3`),children:e.label})]}),t<a-1&&(0,F.jsx)(`span`,{className:M(`h-px flex-1 min-w-4`,r?`bg-accent`:`bg-brd`),"aria-hidden":`true`})]},t)})})]})}var Sn={info:{icon:(0,F.jsx)(h,{size:18}),cls:`border-accent/30 bg-accent/10 text-accent`},ok:{icon:(0,F.jsx)(ue,{size:18}),cls:`border-success/30 bg-success/10 text-success`},warn:{icon:(0,F.jsx)(w,{size:18}),cls:`border-warning/30 bg-warning/10 text-warning`},crit:{icon:(0,F.jsx)(de,{size:18}),cls:`border-danger/30 bg-danger/10 text-danger`}},Cn=e=>{try{return localStorage.getItem(`nms-notice:${e}`)===`1`}catch{return!1}},wn=e=>{try{localStorage.setItem(`nms-notice:${e}`,`1`)}catch{}};function Tn({tone:e=`info`,title:t,children:n,action:r,dismissKey:i,className:a}){let{t:o}=P(),[s,c]=(0,N.useState)(()=>i?Cn(i):!1);if(s)return null;let l=Sn[e];return(0,F.jsxs)(`div`,{role:e===`crit`||e===`warn`?`alert`:`status`,className:M(`flex items-start gap-3 rounded-xl border px-4 py-3`,l.cls,a),children:[(0,F.jsx)(`span`,{className:`shrink-0 mt-0.5`,"aria-hidden":`true`,children:l.icon}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0 text-sm`,children:[t&&(0,F.jsx)(`p`,{className:`font-medium text-tx1`,children:t}),n&&(0,F.jsx)(`div`,{className:M(`text-tx2`,t&&`mt-0.5`),children:n}),r&&(0,F.jsx)(`div`,{className:`mt-2 flex flex-wrap gap-2`,children:r})]}),i&&(0,F.jsx)(`button`,{type:`button`,onClick:()=>{wn(i),c(!0)},className:`shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass`,"aria-label":o(`common.close`),children:(0,F.jsx)(D,{size:16})})]})}function En({children:e,className:t}){return(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`div`,{className:`sticky-action-spacer`,"aria-hidden":`true`}),(0,F.jsx)(`div`,{className:M(`sticky-action-bar`,t),children:e})]})}function Dn(){let{t:e}=P(),{user:t,fetchUser:r,logout:i}=L(),[a,o]=(0,N.useState)(``),[s,c]=(0,N.useState)(``),[l,d]=(0,N.useState)(``),[p,m]=(0,N.useState)(!1),[h,g]=(0,N.useState)(!1),[_,v]=(0,N.useState)(``);if(!t?.must_change_password)return null;let y=async t=>{if(t.preventDefault(),v(``),s!==l){v(e(`profile.passwordMismatch`));return}g(!0);try{if(!(await $e.updateProfile({password:s,current_password:a})).success)throw Error(e(`error.generic`));I.success(e(`profile.updated`)),o(``),c(``),d(``),await r()}catch(t){let n=t instanceof et?t.errorCode:void 0;v(n?e(`error.${n}`,{defaultValue:t.message}):t.message)}finally{g(!1)}},b=(0,F.jsx)(`button`,{type:`button`,onClick:()=>m(e=>!e),tabIndex:-1,"aria-label":`toggle password visibility`,children:p?(0,F.jsx)(f,{size:16}):(0,F.jsx)(u,{size:16})}),x=p?`text`:`password`;return(0,Ut.createPortal)((0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`div`,{className:`modal-overlay`,style:{zIndex:60}}),(0,F.jsx)(`div`,{className:`modal-wrapper`,style:{zIndex:61},role:`dialog`,"aria-modal":`true`,"aria-labelledby":`force-pw-title`,children:(0,F.jsxs)(`form`,{onSubmit:y,className:`relative glass-card w-full max-w-md p-5 md:p-6 rounded-t-2xl md:rounded-2xl animate-fade-in`,children:[(0,F.jsxs)(`div`,{className:`flex items-start gap-3 mb-4`,children:[(0,F.jsx)(`div`,{className:`icon-badge w-10 h-10`,"data-color":`warning`,children:(0,F.jsx)(n,{size:20})}),(0,F.jsxs)(`div`,{children:[(0,F.jsx)(`h2`,{id:`force-pw-title`,className:`section-title`,children:e(`profile.mustChangeTitle`)}),(0,F.jsx)(`p`,{className:`text-sm text-tx3 mt-1`,children:e(`profile.forceMsg`)})]})]}),(0,F.jsxs)(`div`,{className:`space-y-3`,children:[(0,F.jsx)(fn,{label:e(`profile.currentPassword`),type:x,value:a,autoComplete:`current-password`,onChange:e=>o(e.target.value),suffix:b,autoFocus:!0,required:!0}),(0,F.jsx)(fn,{label:e(`profile.newPassword`),type:x,value:s,autoComplete:`new-password`,onChange:e=>c(e.target.value),helperText:e(`profile.forceHint`),required:!0}),(0,F.jsx)(fn,{label:e(`profile.confirmPassword`),type:x,value:l,autoComplete:`new-password`,onChange:e=>d(e.target.value),required:!0})]}),_&&(0,F.jsx)(`p`,{role:`alert`,className:`text-sm text-danger mt-3`,children:_}),(0,F.jsxs)(`div`,{className:`flex items-center justify-between gap-2 mt-5`,children:[(0,F.jsx)(dn,{variant:`ghost`,icon:(0,F.jsx)(ce,{size:14}),onClick:()=>i(),children:e(`topbar.logout`)}),(0,F.jsx)(dn,{type:`submit`,loading:h,disabled:!a||!s||!l,children:e(`profile.saveChanges`)})]})]})})]}),document.body)}function On(e){let t=`=`.repeat((4-e.length%4)%4),n=atob((e+t).replace(/-/g,`+`).replace(/_/g,`/`));return Uint8Array.from(n,e=>e.charCodeAt(0))}function kn(){return`serviceWorker`in navigator&&`PushManager`in window&&`Notification`in window}async function An(){if(!kn())return`unsupported`;if(Notification.permission===`denied`)return`denied`;try{return await(await navigator.serviceWorker.ready).pushManager.getSubscription()?`subscribed`:`unsubscribed`}catch{return`unsubscribed`}}async function jn(){if(!kn()||(Notification.permission===`granted`?`granted`:await Notification.requestPermission())!==`granted`)return!1;let e=await navigator.serviceWorker.ready,{public_key:t}=await $e.pushVapidKey(),n=(await e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:On(t)})).toJSON();return await $e.pushSubscribe({endpoint:n.endpoint||``,keys:n.keys||{}}),!0}async function Mn(){let e=await(await navigator.serviceWorker.ready).pushManager.getSubscription();e&&(await $e.pushUnsubscribe(e.endpoint),await e.unsubscribe())}var Nn=`nms-push-prompt-dismissed`,Pn=7;function Fn(){try{let e=Number(localStorage.getItem(Nn)||0);return e>0&&Date.now()-e<Pn*864e5}catch{return!1}}function In(){let{t:e}=P(),[t,n]=(0,N.useState)(!1),[r,i]=(0,N.useState)(!1);if((0,N.useEffect)(()=>{if(!kn())return;let e=!0;return An().then(async t=>{if(e&&t===`unsubscribed`){if(Notification.permission===`granted`){try{await jn()}catch{}return}Notification.permission==="default"&&!Fn()&&n(!0)}}),()=>{e=!1}},[]),!t)return null;let a=async()=>{i(!0);try{await jn()?I.success(e(`cmp_pprompt.problemNotificationsAreOn`)):I.error(e(`cmp_pprompt.notificationPermissionDenied`)),n(!1)}catch(e){I.error(e.message||`Gagal mengaktifkan notifikasi`)}finally{i(!1)}},o=()=>{try{localStorage.setItem(Nn,String(Date.now()))}catch{}n(!1)};return(0,F.jsx)(`div`,{className:`fixed z-[70] left-3 right-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-96`,children:(0,F.jsxs)(`div`,{className:`bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start`,children:[(0,F.jsx)(ve,{size:20,className:`text-accent shrink-0 mt-0.5`}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,F.jsx)(`p`,{className:`text-sm font-semibold text-tx1`,children:e(`cmp_pprompt.turnOnProblemNotifications`)}),(0,F.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:e(`cmp_pprompt.getOltOnuAlerts`)}),(0,F.jsxs)(`div`,{className:`flex gap-2 mt-3`,children:[(0,F.jsx)(`button`,{onClick:a,disabled:r,className:`btn-primary text-xs disabled:opacity-50`,children:e(`cmp_pprompt.turnOn`)}),(0,F.jsx)(`button`,{onClick:o,className:`px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1`,children:e(`cmp_pprompt.later`)})]})]}),(0,F.jsx)(`button`,{onClick:o,className:`p-1 text-tx3 hover:text-tx1`,"aria-label":`close`,children:(0,F.jsx)(D,{size:16})})]})})}var Ln=`nms-update-dismissed-sha`,Rn=216e5,zn=15e3;async function Bn(){let e=e=>new Promise(t=>setTimeout(t,e)),t=async()=>{try{return(await fetch(`/api/public/branding`,{cache:`no-store`})).ok}catch{return!1}};await e(4e3);for(let n=0;n<45;n++){if(await t()){await e(1500);return}await e(2e3)}}function Vn(){let{t:e}=P(),{user:t}=L(),n=Te(),r=Ce(),[i,a]=(0,N.useState)(null),[o,s]=(0,N.useState)(`idle`),c=!!t?.is_super_admin;if((0,N.useEffect)(()=>{if(!c)return;let e=!0,t=async()=>{try{let t=await(await fetch(`/api/system/update/check`,{credentials:`include`})).json();if(!e||!t.success||t.up_to_date||!t.remote_sha)return;let n=``;try{n=localStorage.getItem(Ln)||``}catch{}n!==t.remote_sha&&a(t)}catch{}},n=window.setTimeout(t,zn),r=window.setInterval(t,Rn);return()=>{e=!1,window.clearTimeout(n),window.clearInterval(r)}},[c]),!i||r.pathname.includes(`/settings/update`))return null;let l=()=>{try{localStorage.setItem(Ln,i.remote_sha||``)}catch{}a(null)},u=()=>{a(null),n(`/dashboard/settings/update`)},d=async()=>{if(confirm(`Pasang update sekarang? Kode terbaru diambil dari GitHub lalu service di-restart — aplikasi tidak bisa diakses beberapa detik.`)){s(`applying`);try{let e=await(await fetch(`/api/system/update/apply`,{method:`POST`,credentials:`include`,headers:{"Content-Type":`application/json`,"X-Requested-With":`XMLHttpRequest`}})).json();if(!e.success){I.error(e.message||`Update gagal`),s(`idle`);return}if(!e.restarted){I.success(e.message),s(`idle`),a(null);return}s(`restarting`),await Bn();try{let e=await navigator.serviceWorker?.getRegistrations?.();await Promise.all((e||[]).map(e=>e.update().catch(()=>void 0)))}catch{}window.location.reload()}catch{I.error(e(`cmp_update.failedToApplyThe`)),s(`idle`)}}},f=i.commits||[];return(0,F.jsx)(`div`,{className:`fixed z-[70] left-3 right-3 top-20 md:left-auto md:right-6 md:w-96`,children:(0,F.jsxs)(`div`,{className:`bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start`,children:[(0,F.jsx)(x,{size:20,className:`text-accent shrink-0 mt-0.5`}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,F.jsx)(`p`,{className:`text-sm font-semibold text-tx1`,children:e(`cmp_update.updateAvailable`)}),(0,F.jsxs)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:[f.length,` perubahan baru di GitHub (`,i.local_sha,` → `,i.remote_sha,`).`]}),f.length>0&&(0,F.jsxs)(`ul`,{className:`mt-2 space-y-0.5 text-[11px] text-tx2 max-h-28 overflow-y-auto`,children:[f.slice(0,5).map(e=>(0,F.jsxs)(`li`,{className:`truncate`,children:[`• `,e.replace(/^[0-9a-f]{7,}\s+/,``)]},e)),f.length>5&&(0,F.jsxs)(`li`,{className:`text-tx3`,children:[`… dan `,f.length-5,` lainnya`]})]}),o===`idle`?(0,F.jsxs)(`div`,{className:`flex flex-wrap gap-2 mt-3`,children:[(0,F.jsx)(`button`,{onClick:d,className:`btn-primary text-xs`,children:e(`cmp_update.updateNow`)}),(0,F.jsx)(`button`,{onClick:u,className:`px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1`,children:`Detail`}),(0,F.jsx)(`button`,{onClick:l,className:`px-3 py-1.5 rounded-xl text-xs text-tx3 hover:text-tx1`,children:e(`cmp_update.later`)})]}):(0,F.jsxs)(`p`,{className:`flex items-center gap-2 mt-3 text-xs text-tx2`,children:[(0,F.jsx)(_e,{size:14,className:`animate-spin`}),o===`applying`?`Mengambil update dari GitHub…`:`Service memulai ulang — halaman dimuat ulang otomatis…`]})]}),o===`idle`&&(0,F.jsx)(`button`,{onClick:l,className:`p-1 text-tx3 hover:text-tx1`,"aria-label":`close`,children:(0,F.jsx)(D,{size:16})})]})})}var Hn=`/dashboard/onus?filter=problem`,Un=[{labelKey:`nav.home`,icon:i,path:`/dashboard`,end:!0},{labelKey:`nav.allOnus`,icon:b,path:`/dashboard/onus`,end:!0},{labelKey:`nav.problems`,icon:w,path:Hn,end:!0},{labelKey:`nav.olt`,icon:p,path:`/dashboard/settings/olts`,end:!1}];function Wn(){let{t:e}=P(),[t,n]=(0,N.useState)(()=>window.innerWidth<1024),[r,i]=(0,N.useState)(!1),a=Ce();(0,N.useEffect)(()=>{i(!1)},[a.pathname]),(0,N.useEffect)(()=>{let e=()=>{window.innerWidth>=1024&&i(!1)};return window.addEventListener(`resize`,e),()=>window.removeEventListener(`resize`,e)},[]);let o=Un,{data:s}=Be({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),c=s?.unregistered||0,l=(s?.offline_count||0)+(s?.dyinggasp_count||0)+(s?.los_count||0),u=a.pathname===`/dashboard/onus`&&new URLSearchParams(a.search).get(`filter`)===`problem`;return(0,F.jsx)(qt,{children:(0,F.jsxs)(`div`,{className:`min-h-screen bg-[var(--bg-primary)] transition-colors duration-300`,children:[(0,F.jsx)($t,{}),(0,F.jsx)(Dn,{}),(0,F.jsx)(In,{}),(0,F.jsx)(Vn,{}),(0,F.jsx)(`div`,{className:`app-mesh-bg`,"aria-hidden":`true`}),(0,F.jsx)(Ht,{collapsed:t,mobileOpen:r,onToggle:()=>n(!t),onMobileClose:()=>i(!1)}),(0,F.jsxs)(`div`,{className:M(`relative z-10 transition-all duration-300 min-h-screen`,t?`lg:ml-[70px]`:`lg:ml-[260px]`),children:[(0,F.jsx)(Qt,{onMenuClick:()=>i(!r)}),(0,F.jsx)(`main`,{className:`p-3 pb-20 lg:pb-6 md:p-4 lg:p-6 overflow-x-hidden max-w-[100vw]`,children:(0,F.jsx)(`div`,{className:`page-enter`,children:(0,F.jsx)(Se,{})},a.pathname)})]}),(0,F.jsx)(`nav`,{className:`fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-xl border-t border-brd lg:hidden mobile-bottom-nav`,children:(0,F.jsxs)(`div`,{className:`flex items-center justify-around h-14 px-1`,children:[o.map(t=>{let n=t.icon,r=t.path===Hn,i=r?l:t.path===`/dashboard/onus`?c:0,a=r?`bg-danger`:`bg-warning`;return(0,F.jsx)(Oe,{to:t.path,end:t.end,className:({isActive:e})=>{let n=r?u:t.path===`/dashboard/onus`?e&&!u:e;return M(`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all relative`,n?`text-accent`:`text-tx3`)},children:({isActive:o})=>{let s=r?u:t.path===`/dashboard/onus`?o&&!u:o;return(0,F.jsxs)(F.Fragment,{children:[(0,F.jsxs)(`div`,{className:M(`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all`,s?`bg-accent/15 scale-105`:`scale-100`),children:[(0,F.jsx)(n,{size:20,strokeWidth:s?2.2:1.8}),i>0&&(0,F.jsx)(`div`,{className:M(`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center`,a),children:i>99?`99+`:i})]}),(0,F.jsx)(`span`,{children:e(t.labelKey)})]})}},t.path)}),(0,F.jsxs)(`button`,{type:`button`,onClick:()=>i(!0),"aria-expanded":r,className:M(`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all`,r?`text-accent`:`text-tx3`),children:[(0,F.jsx)(`div`,{className:`flex items-center justify-center w-8 h-8 rounded-lg`,children:(0,F.jsx)(ge,{size:20,strokeWidth:1.8})}),(0,F.jsx)(`span`,{children:e(`nav.more`)})]})]})})]})})}var Gn={olt:p,onu:b,odp:xe,odc:le,otb:l,user:fe},Kn={olt:`/dashboard/olt-settings`,onu:`/dashboard/onu`,odp:`/dashboard/ftth`,odc:`/dashboard/ftth`,otb:`/dashboard/ftth`,user:`/dashboard/users`},qn={olt:`OLT`,onu:`ONU`,odp:`ODP`,odc:`ODC`,otb:`OTB`,user:`User`};function Jn(){let{t:e}=P(),[t,n]=(0,N.useState)(!1),[r,i]=(0,N.useState)(``),[a,o]=(0,N.useState)({}),[s,c]=(0,N.useState)(!1),[l,u]=(0,N.useState)(0),d=Te(),f=(0,N.useRef)(null),p=(0,N.useRef)(void 0);(0,N.useEffect)(()=>{let e=e=>{(e.ctrlKey||e.metaKey)&&e.key===`k`&&(e.preventDefault(),n(e=>!e),i(``),o({}),u(0)),e.key===`Escape`&&n(!1)};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[]),(0,N.useEffect)(()=>{t&&f.current?.focus()},[t]),(0,N.useEffect)(()=>{if(p.current&&clearTimeout(p.current),r.length<2){o({}),c(!1);return}c(!0),p.current=setTimeout(async()=>{try{let e=await(await fetch(`/api/search?q=${encodeURIComponent(r)}`,{credentials:`include`})).json();o(e.results||{}),u(0)}catch{o({})}finally{c(!1)}},250)},[r]);let m=[];for(let[e,t]of Object.entries(a))for(let n of t)m.push({...n,type:e});let h=(0,N.useCallback)(e=>{n(!1);let t=Kn[e.type]||`/dashboard`;d(e.type===`onu`?`${t}/${e.id}`:e.type===`odp`||e.type===`odc`||e.type===`otb`?`${t}?${e.type}=${e.id}`:t)},[d]);return t?(0,F.jsx)(`div`,{className:`fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm`,onClick:()=>n(!1),children:(0,F.jsxs)(`div`,{className:`w-full max-w-lg mx-4 bg-surface border border-brd rounded-xl shadow-2xl overflow-hidden`,onClick:e=>e.stopPropagation(),children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-3 px-4 py-3 border-b border-brd`,children:[(0,F.jsx)(g,{size:16,className:`text-tx3 flex-shrink-0`}),(0,F.jsx)(`input`,{ref:f,value:r,onChange:e=>i(e.target.value),onKeyDown:e=>{e.key===`ArrowDown`&&(e.preventDefault(),u(e=>Math.min(e+1,m.length-1))),e.key===`ArrowUp`&&(e.preventDefault(),u(e=>Math.max(e-1,0))),e.key===`Enter`&&m[l]&&h(m[l])},placeholder:e(`cmp_search.searchOnusOltsOdps`),className:`flex-1 bg-transparent text-sm outline-none placeholder:text-tx3`}),(0,F.jsx)(`kbd`,{className:`px-1.5 py-0.5 text-[10px] rounded bg-glass text-tx3 font-mono`,children:`ESC`})]}),(0,F.jsxs)(`div`,{className:`max-h-[50vh] overflow-y-auto`,children:[r.length<2&&(0,F.jsx)(`div`,{className:`px-4 py-6 text-center text-xs text-tx3`,children:e(`cmp_search.typeAtLeast2`)}),s&&(0,F.jsx)(`div`,{className:`px-4 py-4 text-center text-xs text-tx3`,children:e(`cmp_search.searching`)}),!s&&r.length>=2&&m.length===0&&(0,F.jsx)(`div`,{className:`px-4 py-6 text-center text-xs text-tx3`,children:e(`cmp_search.noResults`)}),!s&&m.map((e,t)=>{let n=Gn[e.type]||b;return(0,F.jsxs)(`button`,{onClick:()=>h(e),className:M(`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors`,t===l?`bg-accent/10 text-accent`:`hover:bg-glass text-tx2`),onMouseEnter:()=>u(t),children:[(0,F.jsx)(n,{size:15,className:t===l?`text-accent`:`text-tx3`}),(0,F.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,F.jsx)(`div`,{className:`text-sm font-medium truncate`,children:e.name}),(0,F.jsxs)(`div`,{className:`text-[10px] text-tx3 truncate`,children:[qn[e.type],e.serial?` • ${e.serial}`:``,e.ip?` • ${e.ip}`:``,e.olt?` • ${e.olt}`:``,e.status?` • ${e.status}`:``]})]}),(0,F.jsx)(`span`,{className:`text-[10px] text-tx3 uppercase flex-shrink-0`,children:e.type})]},`${e.type}-${e.id}`)})]}),(0,F.jsxs)(`div`,{className:`px-4 py-2 border-t border-brd flex items-center gap-3 text-[10px] text-tx3`,children:[(0,F.jsxs)(`span`,{children:[(0,F.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`↑↓`}),` `,e(`cmp_search.navigate`)]}),(0,F.jsxs)(`span`,{children:[(0,F.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`Enter`}),` `,e(`cmp_search.open`)]}),(0,F.jsxs)(`span`,{children:[(0,F.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`Ctrl+K`}),` `,e(`cmp_search.close`)]})]})]})}):null}var Yn=class extends N.Component{constructor(e){super(e),this.state={hasError:!1,error:null}}static getDerivedStateFromError(e){return{hasError:!0,error:e}}componentDidCatch(e,t){console.error(`ErrorBoundary caught:`,e,t)}handleReload=()=>{this.setState({hasError:!1,error:null}),window.location.reload()};render(){return this.state.hasError?(0,F.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4`,children:(0,F.jsxs)(`div`,{className:`max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center`,children:[(0,F.jsx)(`div`,{className:`mb-4 text-5xl`,children:`⚠️`}),(0,F.jsx)(`h1`,{className:`text-xl font-bold text-[var(--tx-primary)] mb-2`,children:`Something went wrong`}),(0,F.jsx)(`p`,{className:`text-sm text-[var(--tx-tertiary)] mb-4`,children:this.state.error?.message||`An unexpected error occurred.`}),(0,F.jsx)(`button`,{onClick:this.handleReload,className:`px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition`,children:`Reload Page`})]})}):this.props.children}};function Xn(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function Zn(e){if(Array.isArray(e))return e}function Qn(e){if(Array.isArray(e))return Xn(e)}function $n(e,t){if(!(e instanceof t))throw TypeError(`Cannot call a class as a function`)}function er(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,`value`in r&&(r.writable=!0),Object.defineProperty(e,ur(r.key),r)}}function tr(e,t,n){return t&&er(e.prototype,t),n&&er(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}function nr(e,t){var n=typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(!n){if(Array.isArray(e)||(n=fr(e))||t&&e&&typeof e.length==`number`){n&&(e=n);var r=0,i=function(){};return{s:i,n:function(){return r>=e.length?{done:!0}:{done:!1,value:e[r++]}},e:function(e){throw e},f:i}}throw TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}var a,o=!0,s=!1;return{s:function(){n=n.call(e)},n:function(){var e=n.next();return o=e.done,e},e:function(e){s=!0,a=e},f:function(){try{o||n.return==null||n.return()}finally{if(s)throw a}}}}function R(e,t,n){return(t=ur(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function rr(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function ir(e,t){var n=e==null?null:typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(n!=null){var r,i,a,o,s=[],c=!0,l=!1;try{if(a=(n=n.call(e)).next,t===0){if(Object(n)!==n)return;c=!1}else for(;!(c=(r=a.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){l=!0,i=e}finally{try{if(!c&&n.return!=null&&(o=n.return(),Object(o)!==o))return}finally{if(l)throw i}}return s}}function ar(){throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function or(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function sr(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function z(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?sr(Object(n),!0).forEach(function(t){R(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):sr(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function cr(e,t){return Zn(e)||ir(e,t)||fr(e,t)||ar()}function B(e){return Qn(e)||rr(e)||fr(e)||or()}function lr(e,t){if(typeof e!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(typeof r!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function ur(e){var t=lr(e,`string`);return typeof t==`symbol`?t:t+``}function dr(e){"@babel/helpers - typeof";return dr=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},dr(e)}function fr(e,t){if(e){if(typeof e==`string`)return Xn(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?Xn(e,t):void 0}}var pr=function(){},mr={},hr={},gr=null,_r={mark:pr,measure:pr};try{typeof window<`u`&&(mr=window),typeof document<`u`&&(hr=document),typeof MutationObserver<`u`&&(gr=MutationObserver),typeof performance<`u`&&(_r=performance)}catch{}var vr=(mr.navigator||{}).userAgent,yr=vr===void 0?``:vr,br=mr,V=hr,xr=gr,Sr=_r;br.document;var H=!!V.documentElement&&!!V.head&&typeof V.addEventListener==`function`&&typeof V.createElement==`function`,Cr=~yr.indexOf(`MSIE`)||~yr.indexOf(`Trident/`),wr,Tr=/fa(k|kd|s|r|l|t|d|dr|dl|dt|b|slr|slpr|wsb|tl|ns|nds|es|gt|jr|jfr|jdr|usb|ufsb|udsb|cr|ss|sr|sl|st|sds|sdr|sdl|sdt|sldr|slpdr|pr|ms|vs)?[\-\ ]/,Er=/Font ?Awesome ?([567 ]*)(Solid|Regular|Light|Thin|Duotone|Brands|Free|Pro|Sharp Duotone|Sharp|Kit|Notdog Duo|Notdog|Chisel|Etch|Graphite|Thumbprint|Jelly Fill|Jelly Duo|Jelly|Utility|Utility Fill|Utility Duo|Slab Press|Slab|Slab Duo|Slab Press Duo|Pixel|Mosaic|Vellum|Whiteboard)?.*/i,Dr={classic:{fa:`solid`,fas:`solid`,"fa-solid":`solid`,far:`regular`,"fa-regular":`regular`,fal:`light`,"fa-light":`light`,fat:`thin`,"fa-thin":`thin`,fab:`brands`,"fa-brands":`brands`},duotone:{fa:`solid`,fad:`solid`,"fa-solid":`solid`,"fa-duotone":`solid`,fadr:`regular`,"fa-regular":`regular`,fadl:`light`,"fa-light":`light`,fadt:`thin`,"fa-thin":`thin`},sharp:{fa:`solid`,fass:`solid`,"fa-solid":`solid`,fasr:`regular`,"fa-regular":`regular`,fasl:`light`,"fa-light":`light`,fast:`thin`,"fa-thin":`thin`},"sharp-duotone":{fa:`solid`,fasds:`solid`,"fa-solid":`solid`,fasdr:`regular`,"fa-regular":`regular`,fasdl:`light`,"fa-light":`light`,fasdt:`thin`,"fa-thin":`thin`},slab:{"fa-regular":`regular`,faslr:`regular`},"slab-press":{"fa-regular":`regular`,faslpr:`regular`},"slab-duo":{"fa-regular":`regular`,fasldr:`regular`},"slab-press-duo":{"fa-regular":`regular`,faslpdr:`regular`},thumbprint:{"fa-light":`light`,fatl:`light`},vellum:{"fa-solid":`solid`,favs:`solid`},pixel:{"fa-regular":`regular`,fapr:`regular`},mosaic:{"fa-solid":`solid`,fams:`solid`},whiteboard:{"fa-semibold":`semibold`,fawsb:`semibold`},notdog:{"fa-solid":`solid`,fans:`solid`},"notdog-duo":{"fa-solid":`solid`,fands:`solid`},etch:{"fa-solid":`solid`,faes:`solid`},graphite:{"fa-thin":`thin`,fagt:`thin`},jelly:{"fa-regular":`regular`,fajr:`regular`},"jelly-fill":{"fa-regular":`regular`,fajfr:`regular`},"jelly-duo":{"fa-regular":`regular`,fajdr:`regular`},chisel:{"fa-regular":`regular`,facr:`regular`},utility:{"fa-semibold":`semibold`,fausb:`semibold`},"utility-duo":{"fa-semibold":`semibold`,faudsb:`semibold`},"utility-fill":{"fa-semibold":`semibold`,faufsb:`semibold`}},Or={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},kr=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`],U=`classic`,Ar=`duotone`,jr=`sharp`,Mr=`sharp-duotone`,Nr=`chisel`,Pr=`etch`,Fr=`graphite`,Ir=`jelly`,Lr=`jelly-duo`,Rr=`jelly-fill`,zr=`mosaic`,Br=`notdog`,Vr=`notdog-duo`,Hr=`pixel`,Ur=`slab`,Wr=`slab-duo`,Gr=`slab-press`,Kr=`slab-press-duo`,qr=`thumbprint`,Jr=`utility`,Yr=`utility-duo`,Xr=`utility-fill`,Zr=`vellum`,Qr=`whiteboard`,$r=`Classic`,ei=`Duotone`,ti=`Sharp`,ni=`Sharp Duotone`,ri=`Chisel`,ii=`Etch`,ai=`Graphite`,oi=`Jelly`,si=`Jelly Duo`,ci=`Jelly Fill`,li=`Mosaic`,ui=`Notdog`,di=`Notdog Duo`,fi=`Pixel`,pi=`Slab`,mi=`Slab Duo`,hi=`Slab Press`,gi=`Slab Press Duo`,_i=`Thumbprint`,vi=`Utility`,yi=`Utility Duo`,bi=`Utility Fill`,xi=`Vellum`,Si=`Whiteboard`,Ci=[U,Ar,jr,Mr,Nr,Pr,Fr,Ir,Lr,Rr,zr,Br,Vr,Hr,Ur,Wr,Gr,Kr,qr,Jr,Yr,Xr,Zr,Qr];wr={},R(R(R(R(R(R(R(R(R(R(wr,U,$r),Ar,ei),jr,ti),Mr,ni),Nr,ri),Pr,ii),Fr,ai),Ir,oi),Lr,si),Rr,ci),R(R(R(R(R(R(R(R(R(R(wr,zr,li),Br,ui),Vr,di),Hr,fi),Ur,pi),Wr,mi),Gr,hi),Kr,gi),qr,_i),Jr,vi),R(R(R(R(wr,Yr,yi),Xr,bi),Zr,xi),Qr,Si);var wi={classic:{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},duotone:{900:`fad`,400:`fadr`,300:`fadl`,100:`fadt`},sharp:{900:`fass`,400:`fasr`,300:`fasl`,100:`fast`},"sharp-duotone":{900:`fasds`,400:`fasdr`,300:`fasdl`,100:`fasdt`},slab:{400:`faslr`},"slab-press":{400:`faslpr`},"slab-duo":{400:`fasldr`},"slab-press-duo":{400:`faslpdr`},vellum:{900:`favs`},mosaic:{900:`fams`},pixel:{400:`fapr`},whiteboard:{600:`fawsb`},thumbprint:{300:`fatl`},notdog:{900:`fans`},"notdog-duo":{900:`fands`},etch:{900:`faes`},graphite:{100:`fagt`},chisel:{400:`facr`},jelly:{400:`fajr`},"jelly-fill":{400:`fajfr`},"jelly-duo":{400:`fajdr`},utility:{600:`fausb`},"utility-duo":{600:`faudsb`},"utility-fill":{600:`faufsb`}},Ti={"Font Awesome 7 Free":{900:`fas`,400:`far`},"Font Awesome 7 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},"Font Awesome 7 Brands":{400:`fab`,normal:`fab`},"Font Awesome 7 Duotone":{900:`fad`,400:`fadr`,normal:`fadr`,300:`fadl`,100:`fadt`},"Font Awesome 7 Sharp":{900:`fass`,400:`fasr`,normal:`fasr`,300:`fasl`,100:`fast`},"Font Awesome 7 Sharp Duotone":{900:`fasds`,400:`fasdr`,normal:`fasdr`,300:`fasdl`,100:`fasdt`},"Font Awesome 7 Jelly":{400:`fajr`,normal:`fajr`},"Font Awesome 7 Jelly Fill":{400:`fajfr`,normal:`fajfr`},"Font Awesome 7 Jelly Duo":{400:`fajdr`,normal:`fajdr`},"Font Awesome 7 Slab":{400:`faslr`,normal:`faslr`},"Font Awesome 7 Slab Press":{400:`faslpr`,normal:`faslpr`},"Font Awesome 7 Slab Duo":{400:`fasldr`,normal:`fasldr`},"Font Awesome 7 Slab Press Duo":{400:`faslpdr`,normal:`faslpdr`},"Font Awesome 7 Pixel":{400:`fapr`,normal:`fapr`},"Font Awesome 7 Mosaic":{900:`fams`,normal:`fams`},"Font Awesome 7 Vellum":{900:`favs`,normal:`favs`},"Font Awesome 7 Thumbprint":{300:`fatl`,normal:`fatl`},"Font Awesome 7 Notdog":{900:`fans`,normal:`fans`},"Font Awesome 7 Notdog Duo":{900:`fands`,normal:`fands`},"Font Awesome 7 Etch":{900:`faes`,normal:`faes`},"Font Awesome 7 Graphite":{100:`fagt`,normal:`fagt`},"Font Awesome 7 Chisel":{400:`facr`,normal:`facr`},"Font Awesome 7 Whiteboard":{600:`fawsb`,normal:`fawsb`},"Font Awesome 7 Utility":{600:`fausb`,normal:`fausb`},"Font Awesome 7 Utility Duo":{600:`faudsb`,normal:`faudsb`},"Font Awesome 7 Utility Fill":{600:`faufsb`,normal:`faufsb`}},Ei=new Map([[`classic`,{defaultShortPrefixId:`fas`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`,`brands`],futureStyleIds:[],defaultFontWeight:900}],[`duotone`,{defaultShortPrefixId:`fad`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp`,{defaultShortPrefixId:`fass`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp-duotone`,{defaultShortPrefixId:`fasds`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`chisel`,{defaultShortPrefixId:`facr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`etch`,{defaultShortPrefixId:`faes`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`graphite`,{defaultShortPrefixId:`fagt`,defaultStyleId:`thin`,styleIds:[`thin`],futureStyleIds:[],defaultFontWeight:100}],[`jelly`,{defaultShortPrefixId:`fajr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-duo`,{defaultShortPrefixId:`fajdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-fill`,{defaultShortPrefixId:`fajfr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`mosaic`,{defaultShortPrefixId:`fams`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog`,{defaultShortPrefixId:`fans`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog-duo`,{defaultShortPrefixId:`fands`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`pixel`,{defaultShortPrefixId:`fapr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab`,{defaultShortPrefixId:`faslr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-duo`,{defaultShortPrefixId:`fasldr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press`,{defaultShortPrefixId:`faslpr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press-duo`,{defaultShortPrefixId:`faslpdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`thumbprint`,{defaultShortPrefixId:`fatl`,defaultStyleId:`light`,styleIds:[`light`],futureStyleIds:[],defaultFontWeight:300}],[`utility`,{defaultShortPrefixId:`fausb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-duo`,{defaultShortPrefixId:`faudsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-fill`,{defaultShortPrefixId:`faufsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`vellum`,{defaultShortPrefixId:`favs`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`whiteboard`,{defaultShortPrefixId:`fawsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}]]),Di={chisel:{regular:`facr`},classic:{brands:`fab`,light:`fal`,regular:`far`,solid:`fas`,thin:`fat`},duotone:{light:`fadl`,regular:`fadr`,solid:`fad`,thin:`fadt`},etch:{solid:`faes`},graphite:{thin:`fagt`},jelly:{regular:`fajr`},"jelly-duo":{regular:`fajdr`},"jelly-fill":{regular:`fajfr`},mosaic:{solid:`fams`},notdog:{solid:`fans`},"notdog-duo":{solid:`fands`},pixel:{regular:`fapr`},sharp:{light:`fasl`,regular:`fasr`,solid:`fass`,thin:`fast`},"sharp-duotone":{light:`fasdl`,regular:`fasdr`,solid:`fasds`,thin:`fasdt`},slab:{regular:`faslr`},"slab-duo":{regular:`fasldr`},"slab-press":{regular:`faslpr`},"slab-press-duo":{regular:`faslpdr`},thumbprint:{light:`fatl`},utility:{semibold:`fausb`},"utility-duo":{semibold:`faudsb`},"utility-fill":{semibold:`faufsb`},vellum:{solid:`favs`},whiteboard:{semibold:`fawsb`}},Oi=[`fak`,`fa-kit`,`fakd`,`fa-kit-duotone`],ki={kit:{fak:`kit`,"fa-kit":`kit`},"kit-duotone":{fakd:`kit-duotone`,"fa-kit-duotone":`kit-duotone`}},Ai=[`kit`];R(R({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var ji={kit:{"fa-kit":`fak`},"kit-duotone":{"fa-kit-duotone":`fakd`}},Mi={"Font Awesome Kit":{400:`fak`,normal:`fak`},"Font Awesome Kit Duotone":{400:`fakd`,normal:`fakd`}},Ni={kit:{fak:`fa-kit`},"kit-duotone":{fakd:`fa-kit-duotone`}},Pi={kit:{kit:`fak`},"kit-duotone":{"kit-duotone":`fakd`}},Fi,Ii={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},Li=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`];Fi={},R(R(R(R(R(R(R(R(R(R(Fi,`classic`,`Classic`),`duotone`,`Duotone`),`sharp`,`Sharp`),`sharp-duotone`,`Sharp Duotone`),`chisel`,`Chisel`),`etch`,`Etch`),`graphite`,`Graphite`),`jelly`,`Jelly`),`jelly-duo`,`Jelly Duo`),`jelly-fill`,`Jelly Fill`),R(R(R(R(R(R(R(R(R(R(Fi,`mosaic`,`Mosaic`),`notdog`,`Notdog`),`notdog-duo`,`Notdog Duo`),`pixel`,`Pixel`),`slab`,`Slab`),`slab-duo`,`Slab Duo`),`slab-press`,`Slab Press`),`slab-press-duo`,`Slab Press Duo`),`thumbprint`,`Thumbprint`),`utility`,`Utility`),R(R(R(R(Fi,`utility-duo`,`Utility Duo`),`utility-fill`,`Utility Fill`),`vellum`,`Vellum`),`whiteboard`,`Whiteboard`),R(R({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var Ri={classic:{"fa-brands":`fab`,"fa-duotone":`fad`,"fa-light":`fal`,"fa-regular":`far`,"fa-solid":`fas`,"fa-thin":`fat`},duotone:{"fa-regular":`fadr`,"fa-light":`fadl`,"fa-thin":`fadt`},sharp:{"fa-solid":`fass`,"fa-regular":`fasr`,"fa-light":`fasl`,"fa-thin":`fast`},"sharp-duotone":{"fa-solid":`fasds`,"fa-regular":`fasdr`,"fa-light":`fasdl`,"fa-thin":`fasdt`},slab:{"fa-regular":`faslr`},"slab-press":{"fa-regular":`faslpr`},"slab-duo":{"fa-regular":`fasldr`},"slab-press-duo":{"fa-regular":`faslpdr`},pixel:{"fa-regular":`fapr`},mosaic:{"fa-solid":`fams`},vellum:{"fa-solid":`favs`},whiteboard:{"fa-semibold":`fawsb`},thumbprint:{"fa-light":`fatl`},notdog:{"fa-solid":`fans`},"notdog-duo":{"fa-solid":`fands`},etch:{"fa-solid":`faes`},graphite:{"fa-thin":`fagt`},jelly:{"fa-regular":`fajr`},"jelly-fill":{"fa-regular":`fajfr`},"jelly-duo":{"fa-regular":`fajdr`},chisel:{"fa-regular":`facr`},utility:{"fa-semibold":`fausb`},"utility-duo":{"fa-semibold":`faudsb`},"utility-fill":{"fa-semibold":`faufsb`}},zi={classic:[`fas`,`far`,`fal`,`fat`,`fad`],duotone:[`fadr`,`fadl`,`fadt`],sharp:[`fass`,`fasr`,`fasl`,`fast`],"sharp-duotone":[`fasds`,`fasdr`,`fasdl`,`fasdt`],slab:[`faslr`],"slab-press":[`faslpr`],"slab-duo":[`fasldr`],"slab-press-duo":[`faslpdr`],pixel:[`fapr`],mosaic:[`fams`],vellum:[`favs`],whiteboard:[`fawsb`],thumbprint:[`fatl`],notdog:[`fans`],"notdog-duo":[`fands`],etch:[`faes`],graphite:[`fagt`],jelly:[`fajr`],"jelly-fill":[`fajfr`],"jelly-duo":[`fajdr`],chisel:[`facr`],utility:[`fausb`],"utility-duo":[`faudsb`],"utility-fill":[`faufsb`]},Bi={classic:{fab:`fa-brands`,fad:`fa-duotone`,fal:`fa-light`,far:`fa-regular`,fas:`fa-solid`,fat:`fa-thin`},duotone:{fadr:`fa-regular`,fadl:`fa-light`,fadt:`fa-thin`},sharp:{fass:`fa-solid`,fasr:`fa-regular`,fasl:`fa-light`,fast:`fa-thin`},"sharp-duotone":{fasds:`fa-solid`,fasdr:`fa-regular`,fasdl:`fa-light`,fasdt:`fa-thin`},slab:{faslr:`fa-regular`},"slab-press":{faslpr:`fa-regular`},"slab-duo":{fasldr:`fa-regular`},"slab-press-duo":{faslpdr:`fa-regular`},pixel:{fapr:`fa-regular`},mosaic:{fams:`fa-solid`},vellum:{favs:`fa-solid`},whiteboard:{fawsb:`fa-semibold`},thumbprint:{fatl:`fa-light`},notdog:{fans:`fa-solid`},"notdog-duo":{fands:`fa-solid`},etch:{faes:`fa-solid`},graphite:{fagt:`fa-thin`},jelly:{fajr:`fa-regular`},"jelly-fill":{fajfr:`fa-regular`},"jelly-duo":{fajdr:`fa-regular`},chisel:{facr:`fa-regular`},utility:{fausb:`fa-semibold`},"utility-duo":{faudsb:`fa-semibold`},"utility-fill":{faufsb:`fa-semibold`}},Vi=`fa.fas.far.fal.fat.fad.fadr.fadl.fadt.fab.fass.fasr.fasl.fast.fasds.fasdr.fasdl.fasdt.faslr.faslpr.fasldr.faslpdr.fapr.fams.favs.fawsb.fatl.fans.fands.faes.fagt.fajr.fajfr.fajdr.facr.fausb.faudsb.faufsb`.split(`.`).concat(Li,[`fa-solid`,`fa-regular`,`fa-light`,`fa-thin`,`fa-duotone`,`fa-brands`,`fa-semibold`]),Hi=[`solid`,`regular`,`light`,`thin`,`duotone`,`brands`,`semibold`],Ui=[1,2,3,4,5,6,7,8,9,10],Wi=Ui.concat([11,12,13,14,15,16,17,18,19,20]),Gi=[].concat(B(Object.keys(zi)),Hi,[`aw`,`fw`,`pull-left`,`pull-right`],[`2xs`,`xs`,`sm`,`lg`,`xl`,`2xl`,`beat`,`beat-fade`,`border`,`bounce`,`buzz`,`canvas-square`,`canvas-roomy`,`fade`,`flip-360`,`flip-both`,`flip-horizontal`,`flip-vertical`,`flip`,`float`,`inverse`,`jello`,`layers`,`layers-bottom-left`,`layers-bottom-right`,`layers-counter`,`layers-text`,`layers-top-left`,`layers-top-right`,`li`,`pull-end`,`pull-start`,`pulse`,`rotate-180`,`rotate-270`,`rotate-90`,`rotate-by`,`shake`,`spin-pulse`,`spin-reverse`,`spin`,`spin-snap`,`spin-snap-4`,`spin-snap-8`,`stack-1x`,`stack-2x`,`stack`,`swing`,`ul`,`wag`,`width-auto`,`width-fixed`,Ii.GROUP,Ii.SWAP_OPACITY,Ii.PRIMARY,Ii.SECONDARY],Ui.map(function(e){return`${e}x`}),Wi.map(function(e){return`w-${e}`})),Ki={"Font Awesome 5 Free":{900:`fas`,400:`far`},"Font Awesome 5 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`},"Font Awesome 5 Brands":{400:`fab`,normal:`fab`},"Font Awesome 5 Duotone":{900:`fad`}},W=`___FONT_AWESOME___`,qi=16,Ji=`fa`,Yi=`svg-inline--fa`,Xi=`data-fa-i2svg`,Zi=`data-fa-pseudo-element`,Qi=`data-fa-pseudo-element-pending`,$i=`data-prefix`,ea=`data-icon`,ta=`fontawesome-i2svg`,na=`async`,ra=[`HTML`,`HEAD`,`STYLE`,`SCRIPT`],ia=[`::before`,`::after`,`:before`,`:after`],aa=function(){try{return!0}catch{return!1}}();function oa(e){return new Proxy(e,{get:function(e,t){return t in e?e[t]:e[U]}})}var sa=z({},Dr);sa[U]=z(z(z(z({},{"fa-duotone":`duotone`}),Dr[U]),ki.kit),ki[`kit-duotone`]);var ca=oa(sa),la=z({},Di);la[U]=z(z(z(z({},{duotone:`fad`}),la[U]),Pi.kit),Pi[`kit-duotone`]);var ua=oa(la),da=z({},Bi);da[U]=z(z({},da[U]),Ni.kit);var fa=oa(da),pa=z({},Ri);pa[U]=z(z({},pa[U]),ji.kit),oa(pa);var ma=Tr,ha=`fa-layers-text`,ga=Er;oa(z({},wi));var _a=[`class`,`data-prefix`,`data-icon`,`data-fa-transform`,`data-fa-mask`],va=Or,ya=[].concat(B(Ai),B(Gi)),ba=br.FontAwesomeConfig||{};function xa(e){var t=V.querySelector(`script[`+e+`]`);if(t)return t.getAttribute(e)}function Sa(e){return e===``?!0:e===`false`?!1:e===`true`||e}V&&typeof V.querySelector==`function`&&[[`data-family-prefix`,`familyPrefix`],[`data-css-prefix`,`cssPrefix`],[`data-family-default`,`familyDefault`],[`data-style-default`,`styleDefault`],[`data-replacement-class`,`replacementClass`],[`data-auto-replace-svg`,`autoReplaceSvg`],[`data-auto-add-css`,`autoAddCss`],[`data-search-pseudo-elements`,`searchPseudoElements`],[`data-search-pseudo-elements-warnings`,`searchPseudoElementsWarnings`],[`data-search-pseudo-elements-full-scan`,`searchPseudoElementsFullScan`],[`data-observe-mutations`,`observeMutations`],[`data-mutate-approach`,`mutateApproach`],[`data-keep-original-source`,`keepOriginalSource`],[`data-measure-performance`,`measurePerformance`],[`data-show-missing-icons`,`showMissingIcons`]].forEach(function(e){var t=cr(e,2),n=t[0],r=t[1],i=Sa(xa(n));i!=null&&(ba[r]=i)});var Ca={styleDefault:`solid`,familyDefault:U,cssPrefix:Ji,replacementClass:Yi,autoReplaceSvg:!0,autoAddCss:!0,searchPseudoElements:!1,searchPseudoElementsWarnings:!0,searchPseudoElementsFullScan:!1,observeMutations:!0,mutateApproach:`async`,keepOriginalSource:!0,measurePerformance:!1,showMissingIcons:!0};ba.familyPrefix&&(ba.cssPrefix=ba.familyPrefix);var wa=z(z({},Ca),ba);wa.autoReplaceSvg||(wa.observeMutations=!1);var G={};Object.keys(Ca).forEach(function(e){Object.defineProperty(G,e,{enumerable:!0,set:function(t){wa[e]=t,Ta.forEach(function(e){return e(G)})},get:function(){return wa[e]}})}),Object.defineProperty(G,"familyPrefix",{enumerable:!0,set:function(e){wa.cssPrefix=e,Ta.forEach(function(e){return e(G)})},get:function(){return wa.cssPrefix}}),br.FontAwesomeConfig=G;var Ta=[];function Ea(e){return Ta.push(e),function(){Ta.splice(Ta.indexOf(e),1)}}var K=qi,q={size:16,x:0,y:0,rotate:0,flipX:!1,flipY:!1};function Da(e){if(e&&H){var t=V.createElement(`style`);t.setAttribute(`type`,`text/css`),t.innerHTML=e;for(var n=V.head.childNodes,r=null,i=n.length-1;i>-1;i--){var a=n[i],o=(a.tagName||``).toUpperCase();[`STYLE`,`LINK`].indexOf(o)>-1&&(r=a)}return V.head.insertBefore(t,r),e}}var Oa=`0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`;function ka(){for(var e=12,t=``;e-->0;)t+=Oa[Math.random()*62|0];return t}function Aa(e){for(var t=[],n=(e||[]).length>>>0;n--;)t[n]=e[n];return t}function ja(e){return e.classList?Aa(e.classList):(e.getAttribute(`class`)||``).split(` `).filter(function(e){return e})}function Ma(e){return`${e}`.replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function Na(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}="${Ma(e[n])}" `},``).trim()}function Pa(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}: ${e[n].trim()};`},``)}function Fa(e){return e.size!==q.size||e.x!==q.x||e.y!==q.y||e.rotate!==q.rotate||e.flipX||e.flipY}function Ia(e){var t=e.transform,n=e.containerWidth,r=e.iconWidth;return{outer:{transform:`translate(${n/2} 256)`},inner:{transform:`${`translate(${t.x*32}, ${t.y*32}) `} ${`scale(${t.size/16*(t.flipX?-1:1)}, ${t.size/16*(t.flipY?-1:1)}) `} ${`rotate(${t.rotate} 0 0)`}`},path:{transform:`translate(${r/2*-1} -256)`}}}function La(e){var t=e.transform,n=e.width,r=n===void 0?qi:n,i=e.height,a=i===void 0?qi:i,o=e.startCentered,s=o!==void 0&&o,c=``;return c+=s&&Cr?`translate(${t.x/K-r/2}em, ${t.y/K-a/2}em) `:s?`translate(calc(-50% + ${t.x/K}em), calc(-50% + ${t.y/K}em)) `:`translate(${t.x/K}em, ${t.y/K}em) `,c+=`scale(${t.size/K*(t.flipX?-1:1)}, ${t.size/K*(t.flipY?-1:1)}) `,c+=`rotate(${t.rotate}deg) `,c}var Ra=`:root, :host {
  --fa-font-solid: normal 900 1em/1 'Font Awesome 7 Free';
  --fa-font-regular: normal 400 1em/1 'Font Awesome 7 Free';
  --fa-font-light: normal 300 1em/1 'Font Awesome 7 Pro';
  --fa-font-thin: normal 100 1em/1 'Font Awesome 7 Pro';
  --fa-font-duotone: normal 900 1em/1 'Font Awesome 7 Duotone';
  --fa-font-duotone-regular: normal 400 1em/1 'Font Awesome 7 Duotone';
  --fa-font-duotone-light: normal 300 1em/1 'Font Awesome 7 Duotone';
  --fa-font-duotone-thin: normal 100 1em/1 'Font Awesome 7 Duotone';
  --fa-font-brands: normal 400 1em/1 'Font Awesome 7 Brands';
  --fa-font-sharp-solid: normal 900 1em/1 'Font Awesome 7 Sharp';
  --fa-font-sharp-regular: normal 400 1em/1 'Font Awesome 7 Sharp';
  --fa-font-sharp-light: normal 300 1em/1 'Font Awesome 7 Sharp';
  --fa-font-sharp-thin: normal 100 1em/1 'Font Awesome 7 Sharp';
  --fa-font-sharp-duotone-solid: normal 900 1em/1 'Font Awesome 7 Sharp Duotone';
  --fa-font-sharp-duotone-regular: normal 400 1em/1 'Font Awesome 7 Sharp Duotone';
  --fa-font-sharp-duotone-light: normal 300 1em/1 'Font Awesome 7 Sharp Duotone';
  --fa-font-sharp-duotone-thin: normal 100 1em/1 'Font Awesome 7 Sharp Duotone';
  --fa-font-slab-regular: normal 400 1em/1 'Font Awesome 7 Slab';
  --fa-font-slab-press-regular: normal 400 1em/1 'Font Awesome 7 Slab Press';
  --fa-font-slab-duo-regular: normal 400 1em/1 'Font Awesome 7 Slab Duo';
  --fa-font-slab-press-duo-regular: normal 400 1em/1 'Font Awesome 7 Slab Press Duo';
  --fa-font-pixel-regular: normal 400 1em/1 'Font Awesome 7 Pixel';
  --fa-font-mosaic-solid: normal 900 1em/1 'Font Awesome 7 Mosaic';
  --fa-font-vellum-solid: normal 900 1em/1 'Font Awesome 7 Vellum';
  --fa-font-whiteboard-semibold: normal 600 1em/1 'Font Awesome 7 Whiteboard';
  --fa-font-thumbprint-light: normal 300 1em/1 'Font Awesome 7 Thumbprint';
  --fa-font-notdog-solid: normal 900 1em/1 'Font Awesome 7 Notdog';
  --fa-font-notdog-duo-solid: normal 900 1em/1 'Font Awesome 7 Notdog Duo';
  --fa-font-etch-solid: normal 900 1em/1 'Font Awesome 7 Etch';
  --fa-font-graphite-thin: normal 100 1em/1 'Font Awesome 7 Graphite';
  --fa-font-jelly-regular: normal 400 1em/1 'Font Awesome 7 Jelly';
  --fa-font-jelly-fill-regular: normal 400 1em/1 'Font Awesome 7 Jelly Fill';
  --fa-font-jelly-duo-regular: normal 400 1em/1 'Font Awesome 7 Jelly Duo';
  --fa-font-chisel-regular: normal 400 1em/1 'Font Awesome 7 Chisel';
  --fa-font-utility-semibold: normal 600 1em/1 'Font Awesome 7 Utility';
  --fa-font-utility-duo-semibold: normal 600 1em/1 'Font Awesome 7 Utility Duo';
  --fa-font-utility-fill-semibold: normal 600 1em/1 'Font Awesome 7 Utility Fill';
}

.svg-inline--fa {
  box-sizing: content-box;
  display: var(--fa-display, inline-block);
  height: 1em;
  overflow: visible;
  vertical-align: -0.125em;
  width: var(--fa-width, 1.25em);
}
.svg-inline--fa.fa-2xs {
  vertical-align: 0.1em;
}
.svg-inline--fa.fa-xs {
  vertical-align: 0em;
}
.svg-inline--fa.fa-sm {
  vertical-align: -0.0714285714em;
}
.svg-inline--fa.fa-lg {
  vertical-align: -0.2em;
}
.svg-inline--fa.fa-xl {
  vertical-align: -0.25em;
}
.svg-inline--fa.fa-2xl {
  vertical-align: -0.3125em;
}
.svg-inline--fa.fa-pull-left,
.svg-inline--fa .fa-pull-start {
  float: inline-start;
  margin-inline-end: var(--fa-pull-margin, 0.3em);
}
.svg-inline--fa.fa-pull-right,
.svg-inline--fa .fa-pull-end {
  float: inline-end;
  margin-inline-start: var(--fa-pull-margin, 0.3em);
}
.svg-inline--fa.fa-li {
  width: var(--fa-li-width, 2em);
  inset-inline-start: calc(-1 * var(--fa-li-width, 2em));
  inset-block-start: 0.25em; /* syncing vertical alignment with Web Font rendering */
}

.fa-layers-counter, .fa-layers-text {
  display: inline-block;
  position: absolute;
  text-align: center;
}

.fa-layers {
  display: inline-block;
  height: 1em;
  position: relative;
  text-align: center;
  vertical-align: -0.125em;
  width: var(--fa-width, 1.25em);
}
.fa-layers .svg-inline--fa {
  inset: 0;
  margin: auto;
  position: absolute;
  transform-origin: center center;
}

.fa-layers-text {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  transform-origin: center center;
}

.fa-layers-counter {
  background-color: var(--fa-counter-background-color, #ff253a);
  border-radius: var(--fa-counter-border-radius, 1em);
  box-sizing: border-box;
  color: var(--fa-inverse, #fff);
  line-height: var(--fa-counter-line-height, 1);
  max-width: var(--fa-counter-max-width, 5em);
  min-width: var(--fa-counter-min-width, 1.5em);
  overflow: hidden;
  padding: var(--fa-counter-padding, 0.25em 0.5em);
  right: var(--fa-right, 0);
  text-overflow: ellipsis;
  top: var(--fa-top, 0);
  transform: scale(var(--fa-counter-scale, 0.25));
  transform-origin: top right;
}

.fa-layers-bottom-right {
  bottom: var(--fa-bottom, 0);
  right: var(--fa-right, 0);
  top: auto;
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: bottom right;
}

.fa-layers-bottom-left {
  bottom: var(--fa-bottom, 0);
  left: var(--fa-left, 0);
  right: auto;
  top: auto;
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: bottom left;
}

.fa-layers-top-right {
  top: var(--fa-top, 0);
  right: var(--fa-right, 0);
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: top right;
}

.fa-layers-top-left {
  left: var(--fa-left, 0);
  right: auto;
  top: var(--fa-top, 0);
  transform: scale(var(--fa-layers-scale, 0.25));
  transform-origin: top left;
}

.fa-1x {
  font-size: 1em;
}

.fa-2x {
  font-size: 2em;
}

.fa-3x {
  font-size: 3em;
}

.fa-4x {
  font-size: 4em;
}

.fa-5x {
  font-size: 5em;
}

.fa-6x {
  font-size: 6em;
}

.fa-7x {
  font-size: 7em;
}

.fa-8x {
  font-size: 8em;
}

.fa-9x {
  font-size: 9em;
}

.fa-10x {
  font-size: 10em;
}

.fa-2xs {
  font-size: calc(10 / 16 * 1em); /* converts a 10px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 10 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 10 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-xs {
  font-size: calc(12 / 16 * 1em); /* converts a 12px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 12 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 12 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-sm {
  font-size: calc(14 / 16 * 1em); /* converts a 14px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 14 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 14 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-lg {
  font-size: calc(20 / 16 * 1em); /* converts a 20px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 20 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 20 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-xl {
  font-size: calc(24 / 16 * 1em); /* converts a 24px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 24 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 24 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-2xl {
  font-size: calc(32 / 16 * 1em); /* converts a 32px size into an em-based value that's relative to the scale's 16px base */
  line-height: calc(1 / 32 * 1em); /* sets the line-height of the icon back to that of it's parent */
  vertical-align: calc((6 / 32 - 0.375) * 1em); /* vertically centers the icon taking into account the surrounding text's descender */
}

.fa-width-auto {
  --fa-width: auto;
}

.fa-fw,
.fa-width-fixed {
  --fa-width: 1.25em;
}

.fa-canvas-square {
  padding-block: 0.125em;
  margin-block-end: -0.125em;
}

.fa-canvas-roomy {
  padding-block: 0.25em;
  padding-inline: 0.125em;
  margin-block-end: -0.25em;
  box-sizing: content-box;
}

.fa-ul {
  list-style-type: none;
  margin-inline-start: var(--fa-li-margin, 2.5em);
  padding-inline-start: 0;
}
.fa-ul > li {
  position: relative;
}

.fa-li {
  inset-inline-start: calc(-1 * var(--fa-li-width, 2em));
  position: absolute;
  text-align: center;
  width: var(--fa-li-width, 2em);
  line-height: inherit;
}

/* Heads Up: Bordered Icons will not be supported in the future!
  - This feature will be deprecated in the next major release of Font Awesome (v8)!
  - You may continue to use it in this version *v7), but it will not be supported in Font Awesome v8.
*/
/* Notes:
* --@{v.$css-prefix}-border-width = 1/16 by default (to render as ~1px based on a 16px default font-size)
* --@{v.$css-prefix}-border-padding =
  ** 3/16 for vertical padding (to give ~2px of vertical whitespace around an icon considering it's vertical alignment)
  ** 4/16 for horizontal padding (to give ~4px of horizontal whitespace around an icon)
*/
.fa-border {
  border-color: var(--fa-border-color, #eee);
  border-radius: var(--fa-border-radius, 0.1em);
  border-style: var(--fa-border-style, solid);
  border-width: var(--fa-border-width, 0.0625em);
  box-sizing: var(--fa-border-box-sizing, content-box);
  padding: var(--fa-border-padding, 0.1875em 0.25em);
}

.fa-pull-left,
.fa-pull-start {
  float: inline-start;
  margin-inline-end: var(--fa-pull-margin, 0.3em);
}

.fa-pull-right,
.fa-pull-end {
  float: inline-end;
  margin-inline-start: var(--fa-pull-margin, 0.3em);
}

.fa-beat {
  animation-name: fa-beat;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-bounce {
  animation-name: fa-bounce;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));
}

.fa-fade {
  animation-name: fa-fade;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-beat-fade {
  animation-name: fa-beat-fade;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-flip {
  animation-name: fa-flip;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1.5s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-flip-360 {
  animation-name: fa-flip-360;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-shake {
  animation-name: fa-shake;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 0.75s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
}

.fa-spin {
  animation-name: fa-spin;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 2s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-spin-reverse {
  --fa-animation-direction: reverse;
}

.fa-pulse,
.fa-spin-pulse {
  animation-name: fa-spin;
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, steps(8));
}

.fa-spin-snap {
  animation-name: fa-spin-snap;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 3s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-spin-snap-4 {
  animation-name: fa-spin-snap-4;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 2.4s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-spin-snap-8 {
  animation-name: fa-spin-snap-8;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 4s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-buzz {
  animation-name: fa-buzz;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 0.6s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, linear);
}

.fa-wag {
  animation-name: fa-wag;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 0.9s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-out);
  transform-origin: bottom center;
}

.fa-float {
  animation-name: fa-float;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 3s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-in-out);
  will-change: transform;
}

.fa-swing {
  animation-name: fa-swing;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 1.2s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-out);
  transform-origin: top center;
}

.fa-jello {
  animation-name: fa-jello;
  animation-delay: var(--fa-animation-delay, 0s);
  animation-direction: var(--fa-animation-direction, normal);
  animation-duration: var(--fa-animation-duration, 0.9s);
  animation-iteration-count: var(--fa-animation-iteration-count, infinite);
  animation-timing-function: var(--fa-animation-timing, ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .fa-beat,
  .fa-bounce,
  .fa-fade,
  .fa-beat-fade,
  .fa-flip,
  .fa-flip-360,
  .fa-pulse,
  .fa-shake,
  .fa-spin,
  .fa-spin-pulse,
  .fa-buzz,
  .fa-float,
  .fa-jello,
  .fa-spin-snap,
  .fa-spin-snap-4,
  .fa-spin-snap-8,
  .fa-swing,
  .fa-wag {
    animation: none !important;
    transition: none !important;
  }
}
@keyframes fa-beat {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(calc(1.25 * var(--fa-beat-scale, 1.25)));
  }
  45% {
    transform: scale(calc(1.22 * var(--fa-beat-scale, 1.22)));
  }
  65% {
    transform: scale(calc(1.25 * var(--fa-beat-scale, 1.25)));
  }
  90% {
    transform: scale(1);
  }
}
@keyframes fa-bounce {
  0% {
    transform: scale(1, 1) translateY(0);
    animation-timing-function: var(--fa-animation-timing);
  }
  14% {
    transform: scale(var(--fa-bounce-start-scale-x, 1.06), var(--fa-bounce-start-scale-y, 0.94)) translateY(var(--fa-bounce-anticipation, 3px));
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
  }
  32% {
    transform: scale(var(--fa-bounce-jump-scale-x, 0.94), var(--fa-bounce-jump-scale-y, 1.12)) translateY(calc(-1 * var(--fa-bounce-height, 0.5em)));
    animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
  }
  52% {
    transform: scale(1, 1) translateY(calc(-1 * var(--fa-bounce-height, 0.5em) * 1.1));
    animation-timing-function: cubic-bezier(0.5, 0, 1, 0.5);
  }
  70% {
    transform: scale(var(--fa-bounce-land-scale-x, 1.06), var(--fa-bounce-land-scale-y, 0.92)) translateY(0);
    animation-timing-function: cubic-bezier(0.33, 0.33, 0.66, 1);
  }
  85% {
    transform: scale(0.98, 1.04) translateY(calc(-2px * var(--fa-bounce-rebound, 1)));
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
  }
  100% {
    transform: scale(1, 1) translateY(0);
  }
}
@keyframes fa-fade {
  0% {
    opacity: 1;
    transform: scale(1);
    animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
  }
  40% {
    opacity: var(--fa-fade-opacity, 0.4);
    transform: scale(0.98);
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes fa-beat-fade {
  0% {
    opacity: var(--fa-beat-fade-opacity, 0.4);
    transform: scale(1);
    animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
  }
  25% {
    opacity: calc(var(--fa-beat-fade-opacity, 0.4) + 0.4);
    transform: scale(var(--fa-beat-fade-scale, 1.28));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  45% {
    opacity: 1;
    transform: scale(var(--fa-beat-fade-scale, 1.25));
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  65% {
    opacity: calc(var(--fa-beat-fade-opacity, 0.4) + 0.4);
    transform: scale(var(--fa-beat-fade-scale, 1.28));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  100% {
    opacity: var(--fa-beat-fade-opacity, 0.4);
    transform: scale(1);
  }
}
@keyframes fa-flip {
  0% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), 0deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
  }
  8% {
    transform: perspective(2em) scale(var(--fa-flip-anticipation-scale, 0.95)) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), 0deg);
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
  }
  35% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), calc(var(--fa-flip-angle, -360deg) * 0.6));
    animation-timing-function: linear;
  }
  65% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), calc(var(--fa-flip-angle, -360deg) * 0.5));
    animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
  }
  92% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), calc(var(--fa-flip-angle, -360deg) * var(--fa-flip-overshoot, 1.04)));
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
  }
  100% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -360deg));
  }
}
@keyframes fa-flip-360 {
  0% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), 0deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
  }
  8% {
    transform: perspective(2em) scale(var(--fa-flip-anticipation-scale, 0.95)) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), 0deg);
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
  }
  50% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), calc(var(--fa-flip-angle, -360deg) * 0.6));
    animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
  }
  80% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), calc(var(--fa-flip-angle, -360deg) * var(--fa-flip-overshoot, 1.04)));
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
  }
  100% {
    transform: perspective(2em) scale(1) rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -360deg));
  }
}
@keyframes fa-shake {
  0% {
    transform: rotate(0deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
  }
  8% {
    transform: rotate(35deg) translateX(1px);
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  20% {
    transform: rotate(-22deg) translateX(-1px);
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  35% {
    transform: rotate(15deg) translateX(1px);
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  50% {
    transform: rotate(-9deg);
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  65% {
    transform: rotate(5deg);
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  78% {
    transform: rotate(-3deg);
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  90% {
    transform: rotate(1deg);
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  100% {
    transform: rotate(0deg);
  }
}
@keyframes fa-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
@keyframes fa-spin-snap {
  0% {
    transform: rotate(0deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  12% {
    transform: rotate(60deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  16.67% {
    transform: rotate(60deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  28.67% {
    transform: rotate(120deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  33.33% {
    transform: rotate(120deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  45.33% {
    transform: rotate(180deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: rotate(180deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  62% {
    transform: rotate(240deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  66.67% {
    transform: rotate(240deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  78.67% {
    transform: rotate(300deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  83.33% {
    transform: rotate(300deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  95.33% {
    transform: rotate(360deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  100% {
    transform: rotate(360deg);
  }
}
@keyframes fa-spin-snap-4 {
  0% {
    transform: rotate(0deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  15% {
    transform: rotate(90deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  25% {
    transform: rotate(90deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  40% {
    transform: rotate(180deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: rotate(180deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  65% {
    transform: rotate(270deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  75% {
    transform: rotate(270deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  90% {
    transform: rotate(360deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  100% {
    transform: rotate(360deg);
  }
}
@keyframes fa-spin-snap-8 {
  0% {
    transform: rotate(0deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  9% {
    transform: rotate(45deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  12.5% {
    transform: rotate(45deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  21.5% {
    transform: rotate(90deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  25% {
    transform: rotate(90deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  34% {
    transform: rotate(135deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  37.5% {
    transform: rotate(135deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  46.5% {
    transform: rotate(180deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: rotate(180deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  59% {
    transform: rotate(225deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  62.5% {
    transform: rotate(225deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  71.5% {
    transform: rotate(270deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  75% {
    transform: rotate(270deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  84% {
    transform: rotate(315deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  87.5% {
    transform: rotate(315deg);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
  96.5% {
    transform: rotate(360deg);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  100% {
    transform: rotate(360deg);
  }
}
@keyframes fa-buzz {
  0% {
    transform: translateX(0) rotate(0deg);
    animation-timing-function: cubic-bezier(0.1, 0, 0.9, 1);
  }
  5% {
    transform: translateX(var(--fa-buzz-distance, 4px)) rotate(0.5deg);
  }
  10% {
    transform: translateX(calc(-1 * var(--fa-buzz-distance, 4px))) rotate(-0.5deg);
  }
  15% {
    transform: translateX(var(--fa-buzz-distance, 4px)) rotate(0.3deg);
  }
  20% {
    transform: translateX(calc(-1 * var(--fa-buzz-distance, 4px))) rotate(-0.3deg);
  }
  25% {
    transform: translateX(calc(var(--fa-buzz-distance, 4px) * 0.7)) rotate(0.2deg);
  }
  30% {
    transform: translateX(calc(-1 * var(--fa-buzz-distance, 4px) * 0.7)) rotate(-0.2deg);
  }
  35% {
    transform: translateX(calc(var(--fa-buzz-distance, 4px) * 0.4)) rotate(0.1deg);
  }
  40% {
    transform: translateX(0) rotate(0deg);
  }
  100% {
    transform: translateX(0) rotate(0deg);
  }
}
@keyframes fa-wag {
  0% {
    transform: rotate(0deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
  }
  12% {
    transform: rotate(var(--fa-wag-angle, 12deg));
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  24% {
    transform: rotate(2deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
  }
  36% {
    transform: rotate(calc(var(--fa-wag-angle, 12deg) * 0.85));
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  48% {
    transform: rotate(1deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
  }
  58% {
    transform: rotate(calc(var(--fa-wag-angle, 12deg) * 0.6));
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  68% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(0deg);
  }
}
@keyframes fa-float {
  0% {
    transform: translateY(0) translateX(0) rotate(0deg) scale(var(--fa-float-squash-x, 1.02), var(--fa-float-squash-y, 0.98));
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
  }
  15% {
    transform: translateY(calc(-0.4 * var(--fa-float-height, 6px))) translateX(var(--fa-float-drift, 1px)) rotate(var(--fa-float-tilt, 1deg)) scale(1, 1);
    animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
  }
  35% {
    transform: translateY(calc(-1 * var(--fa-float-height, 6px))) translateX(0) rotate(0deg) scale(var(--fa-float-stretch-x, 0.98), var(--fa-float-stretch-y, 1.03));
    animation-timing-function: cubic-bezier(0.5, 0, 0.5, 0);
  }
  50% {
    transform: translateY(calc(-0.92 * var(--fa-float-height, 6px))) translateX(calc(-0.5 * var(--fa-float-drift, 1px))) rotate(calc(-0.5 * var(--fa-float-tilt, 1deg))) scale(0.995, 1.01);
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
  }
  70% {
    transform: translateY(calc(-0.3 * var(--fa-float-height, 6px))) translateX(calc(-1 * var(--fa-float-drift, 1px))) rotate(calc(-1 * var(--fa-float-tilt, 1deg))) scale(1, 1);
    animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
  }
  90% {
    transform: translateY(calc(0.05 * var(--fa-float-height, 6px))) translateX(0) rotate(0deg) scale(var(--fa-float-squash-x, 1.02), var(--fa-float-squash-y, 0.98));
    animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
  }
  100% {
    transform: translateY(0) translateX(0) rotate(0deg) scale(var(--fa-float-squash-x, 1.02), var(--fa-float-squash-y, 0.98));
  }
}
@keyframes fa-swing {
  0% {
    transform: rotate(0deg);
    animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
  }
  8% {
    transform: rotate(var(--fa-swing-angle, 22deg));
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  18% {
    transform: rotate(calc(-1 * var(--fa-swing-angle, 22deg) * 0.85));
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  28% {
    transform: rotate(calc(var(--fa-swing-angle, 22deg) * 0.65));
    animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
  }
  38% {
    transform: rotate(calc(-1 * var(--fa-swing-angle, 22deg) * 0.45));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  48% {
    transform: rotate(calc(var(--fa-swing-angle, 22deg) * 0.25));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  56% {
    transform: rotate(calc(-1 * var(--fa-swing-angle, 22deg) * 0.1));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  64% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(0deg);
  }
}
@keyframes fa-jello {
  0% {
    transform: scale(1, 1);
    animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
  }
  12% {
    transform: scale(var(--fa-jello-scale-x, 1.15), calc(2 - var(--fa-jello-scale-x, 1.15)));
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  24% {
    transform: scale(calc(2 - var(--fa-jello-scale-y, 1.12)), var(--fa-jello-scale-y, 1.12));
    animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
  }
  36% {
    transform: scale(calc(1 + (var(--fa-jello-scale-x, 1.15) - 1) * 0.5), calc(2 - (1 + (var(--fa-jello-scale-x, 1.15) - 1) * 0.5)));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  48% {
    transform: scale(calc(2 - (1 + (var(--fa-jello-scale-y, 1.12) - 1) * 0.3)), calc(1 + (var(--fa-jello-scale-y, 1.12) - 1) * 0.3));
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  58% {
    transform: scale(1.02, 0.98);
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  68% {
    transform: scale(1, 1);
  }
  100% {
    transform: scale(1, 1);
  }
}
.fa-rotate-90 {
  transform: rotate(90deg);
}

.fa-rotate-180 {
  transform: rotate(180deg);
}

.fa-rotate-270 {
  transform: rotate(270deg);
}

.fa-flip-horizontal {
  transform: scale(-1, 1);
}

.fa-flip-vertical {
  transform: scale(1, -1);
}

.fa-flip-both,
.fa-flip-horizontal.fa-flip-vertical {
  transform: scale(-1, -1);
}

.fa-rotate-by {
  transform: rotate(var(--fa-rotate-angle, 0));
}

.svg-inline--fa .fa-primary {
  fill: var(--fa-primary-color, currentColor);
  opacity: var(--fa-primary-opacity, 1);
}

.svg-inline--fa .fa-secondary {
  fill: var(--fa-secondary-color, currentColor);
  opacity: var(--fa-secondary-opacity, 0.4);
}

.svg-inline--fa.fa-swap-opacity .fa-primary {
  opacity: var(--fa-secondary-opacity, 0.4);
}

.svg-inline--fa.fa-swap-opacity .fa-secondary {
  opacity: var(--fa-primary-opacity, 1);
}

.svg-inline--fa mask .fa-primary,
.svg-inline--fa mask .fa-secondary {
  fill: black;
}

.svg-inline--fa.fa-inverse {
  fill: var(--fa-inverse, #fff);
}

.fa-stack {
  display: inline-block;
  height: 2em;
  line-height: 2em;
  position: relative;
  vertical-align: middle;
  width: 2.5em;
}

.fa-inverse {
  color: var(--fa-inverse, #fff);
}

.svg-inline--fa.fa-stack-1x {
  --fa-width: 1.25em;
  height: 1em;
  width: var(--fa-width);
}
.svg-inline--fa.fa-stack-2x {
  --fa-width: 2.5em;
  height: 2em;
  width: var(--fa-width);
}

.fa-stack-1x,
.fa-stack-2x {
  inset: 0;
  margin: auto;
  position: absolute;
  z-index: var(--fa-stack-z-index, auto);
}`;function za(){var e=Ji,t=Yi,n=G.cssPrefix,r=G.replacementClass,i=Ra;if(n!==e||r!==t){var a=RegExp(`\\.${e}\\-`,`g`),o=RegExp(`\\--${e}\\-`,`g`),s=RegExp(`\\.${t}`,`g`);i=i.replace(a,`.${n}-`).replace(o,`--${n}-`).replace(s,`.${r}`)}return i}var Ba=!1;function Va(){G.autoAddCss&&!Ba&&(Da(za()),Ba=!0)}var Ha={mixout:function(){return{dom:{css:za,insertCss:Va}}},hooks:function(){return{beforeDOMElementCreation:function(){Va()},beforeI2svg:function(){Va()}}}},J=br||{};J[W]||(J[W]={}),J[W].styles||(J[W].styles={}),J[W].hooks||(J[W].hooks={}),J[W].shims||(J[W].shims=[]);var Y=J[W],Ua=[],Wa=function(){V.removeEventListener(`DOMContentLoaded`,Wa),Ga=1,Ua.map(function(e){return e()})},Ga=!1;H&&(Ga=(V.documentElement.doScroll?/^loaded|^c/:/^loaded|^i|^c/).test(V.readyState),Ga||V.addEventListener(`DOMContentLoaded`,Wa));function Ka(e){H&&(Ga?setTimeout(e,0):Ua.push(e))}function qa(e){var t=e.tag,n=e.attributes,r=n===void 0?{}:n,i=e.children,a=i===void 0?[]:i;return typeof e==`string`?Ma(e):`<${t} ${Na(r)}>${a.map(qa).join(``)}</${t}>`}function Ja(e,t,n){if(e&&e[t]&&e[t][n])return{prefix:t,iconName:n,icon:e[t][n]}}var Ya=function(e,t){return function(n,r,i,a){return e.call(t,n,r,i,a)}},Xa=function(e,t,n,r){var i=Object.keys(e),a=i.length,o=r===void 0?t:Ya(t,r),s,c,l;for(n===void 0?(s=1,l=e[i[0]]):(s=0,l=n);s<a;s++)c=i[s],l=o(l,e[c],c,e);return l};function Za(e){return B(e).length===1?e.codePointAt(0).toString(16):null}function Qa(e){return Object.keys(e).reduce(function(t,n){var r=e[n];return r.icon?t[r.iconName]=r.icon:t[n]=r,t},{})}function $a(e,t){var n=(arguments.length>2&&arguments[2]!==void 0?arguments[2]:{}).skipHooks,r=n!==void 0&&n,i=Qa(t);typeof Y.hooks.addPack==`function`&&!r?Y.hooks.addPack(e,Qa(t)):Y.styles[e]=z(z({},Y.styles[e]||{}),i),e===`fas`&&$a(`fa`,t)}var eo=Y.styles,to=Y.shims,no=Object.keys(fa),ro=no.reduce(function(e,t){return e[t]=Object.keys(fa[t]),e},{}),io=null,ao={},oo={},so={},co={},lo={};function uo(e){return~ya.indexOf(e)}function fo(e,t){var n=t.split(`-`),r=n[0],i=n.slice(1).join(`-`);return r===e&&i!==``&&!uo(i)?i:null}var po=function(){var e=function(e){return Xa(eo,function(t,n,r){return t[r]=Xa(n,e,{}),t},{})};ao=e(function(e,t,n){return t[3]&&(e[t[3]]=n),t[2]&&t[2].filter(function(e){return typeof e==`number`}).forEach(function(t){e[t.toString(16)]=n}),e}),oo=e(function(e,t,n){return e[n]=n,t[2]&&t[2].filter(function(e){return typeof e==`string`}).forEach(function(t){e[t]=n}),e}),lo=e(function(e,t,n){var r=t[2];return e[n]=n,r.forEach(function(t){e[t]=n}),e});var t=`far`in eo||G.autoFetchSvg,n=Xa(to,function(e,n){var r=n[0],i=n[1],a=n[2];return i===`far`&&!t&&(i=`fas`),typeof r==`string`&&(e.names[r]={prefix:i,iconName:a}),typeof r==`number`&&(e.unicodes[r.toString(16)]={prefix:i,iconName:a}),e},{names:{},unicodes:{}});so=n.names,co=n.unicodes,io=xo(G.styleDefault,{family:G.familyDefault})};Ea(function(e){io=xo(e.styleDefault,{family:G.familyDefault})}),po();function mo(e,t){return(ao[e]||{})[t]}function ho(e,t){return(oo[e]||{})[t]}function go(e,t){return(lo[e]||{})[t]}function _o(e){return so[e]||{prefix:null,iconName:null}}function vo(e){var t=co[e],n=mo(`fas`,e);return t||(n?{prefix:`fas`,iconName:n}:null)||{prefix:null,iconName:null}}function X(){return io}var yo=function(){return{prefix:null,iconName:null,rest:[]}};function bo(e){var t=U,n=no.reduce(function(e,t){return e[t]=`${G.cssPrefix}-${t}`,e},{});return Ci.forEach(function(r){(e.includes(n[r])||e.some(function(e){return ro[r].includes(e)}))&&(t=r)}),t}function xo(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).family,n=t===void 0?U:t,r=ca[n][e];if(n===Ar&&!e)return`fad`;var i=ua[n][e]||ua[n][r],a=e in Y.styles?e:null;return i||a||null}function So(e){var t=[],n=null;return e.forEach(function(e){var r=fo(G.cssPrefix,e);r?n=r:e&&t.push(e)}),{iconName:n,rest:t}}function Co(e){return e.sort().filter(function(e,t,n){return n.indexOf(e)===t})}var wo=Vi.concat(Oi);function To(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).skipLookups,n=t!==void 0&&t,r=null,i=Co(e.filter(function(e){return wo.includes(e)})),a=Co(e.filter(function(e){return!wo.includes(e)})),o=cr(i.filter(function(e){return r=e,!kr.includes(e)}),1)[0],s=o===void 0?null:o,c=bo(i),l=z(z({},So(a)),{},{prefix:xo(s,{family:c})});return z(z(z({},l),ko({values:e,family:c,styles:eo,config:G,canonical:l,givenPrefix:r})),Eo(n,r,l))}function Eo(e,t,n){var r=n.prefix,i=n.iconName;if(e||!r||!i)return{prefix:r,iconName:i};var a=t===`fa`?_o(i):{},o=go(r,i);return i=a.iconName||o||i,r=a.prefix||r,r===`far`&&!eo.far&&eo.fas&&!G.autoFetchSvg&&(r=`fas`),{prefix:r,iconName:i}}var Do=Ci.filter(function(e){return e!==U||e!==Ar}),Oo=Object.keys(Bi).filter(function(e){return e!==U}).map(function(e){return Object.keys(Bi[e])}).flat();function ko(e){var t=e.values,n=e.family,r=e.canonical,i=e.givenPrefix,a=i===void 0?``:i,o=e.styles,s=o===void 0?{}:o,c=e.config,l=c===void 0?{}:c,u=n===Ar,d=t.includes(`fa-duotone`)||t.includes(`fad`),f=l.familyDefault===`duotone`,p=r.prefix===`fad`||r.prefix===`fa-duotone`;return!u&&(d||f||p)&&(r.prefix=`fad`),(t.includes(`fa-brands`)||t.includes(`fab`))&&(r.prefix=`fab`),!r.prefix&&Do.includes(n)&&(Object.keys(s).find(function(e){return Oo.includes(e)})||l.autoFetchSvg)&&(r.prefix=Ei.get(n).defaultShortPrefixId,r.iconName=go(r.prefix,r.iconName)||r.iconName),(r.prefix===`fa`||a===`fa`)&&(r.prefix=X()||`fas`),r}var Ao=function(){function e(){$n(this,e),this.definitions={}}return tr(e,[{key:`add`,value:function(){var e=this,t=[...arguments].reduce(this._pullDefinitions,{});Object.keys(t).forEach(function(n){e.definitions[n]=z(z({},e.definitions[n]||{}),t[n]),$a(n,t[n]);var r=fa[U][n];r&&$a(r,t[n]),po()})}},{key:`reset`,value:function(){this.definitions={}}},{key:`_pullDefinitions`,value:function(e,t){var n=t.prefix&&t.iconName&&t.icon?{0:t}:t;return Object.keys(n).map(function(t){var r=n[t],i=r.prefix,a=r.iconName,o=r.icon,s=o[2];e[i]||(e[i]={}),s.length>0&&s.forEach(function(t){typeof t==`string`&&(e[i][t]=o)}),e[i][a]=o}),e}}])}(),jo=[],Mo={},No={},Po=Object.keys(No);function Fo(e,t){var n=t.mixoutsTo;return jo=e,Mo={},Object.keys(No).forEach(function(e){Po.indexOf(e)===-1&&delete No[e]}),jo.forEach(function(e){var t=e.mixout?e.mixout():{};if(Object.keys(t).forEach(function(e){typeof t[e]==`function`&&(n[e]=t[e]),dr(t[e])===`object`&&Object.keys(t[e]).forEach(function(r){n[e]||(n[e]={}),n[e][r]=t[e][r]})}),e.hooks){var r=e.hooks();Object.keys(r).forEach(function(e){Mo[e]||(Mo[e]=[]),Mo[e].push(r[e])})}e.provides&&e.provides(No)}),n}function Io(e,t){var n=[...arguments].slice(2);return(Mo[e]||[]).forEach(function(e){t=e.apply(null,[t].concat(n))}),t}function Lo(e){var t=[...arguments].slice(1);(Mo[e]||[]).forEach(function(e){e.apply(null,t)})}function Ro(){var e=arguments[0],t=Array.prototype.slice.call(arguments,1);return No[e]?No[e].apply(null,t):void 0}function zo(e){e.prefix===`fa`&&(e.prefix=`fas`);var t=e.iconName,n=e.prefix||X();if(t)return t=go(n,t)||t,Ja(Bo.definitions,n,t)||Ja(Y.styles,n,t)}var Bo=new Ao,Z={noAuto:function(){G.autoReplaceSvg=!1,G.observeMutations=!1,Lo(`noAuto`)},config:G,dom:{i2svg:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return H?(Lo(`beforeI2svg`,e),Ro(`pseudoElements2svg`,e),Ro(`i2svg`,e)):Promise.reject(Error(`Operation requires a DOM of some kind.`))},watch:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=e.autoReplaceSvgRoot;G.autoReplaceSvg===!1&&(G.autoReplaceSvg=!0),G.observeMutations=!0,Ka(function(){Vo({autoReplaceSvgRoot:t}),Lo(`watch`,e)})}},parse:{icon:function(e){if(e===null)return null;if(dr(e)===`object`&&e.prefix&&e.iconName)return{prefix:e.prefix,iconName:go(e.prefix,e.iconName)||e.iconName};if(Array.isArray(e)&&e.length===2){var t=e[1].indexOf(`fa-`)===0?e[1].slice(3):e[1],n=xo(e[0]);return{prefix:n,iconName:go(n,t)||t}}if(typeof e==`string`&&(e.indexOf(`${G.cssPrefix}-`)>-1||e.match(ma))){var r=To(e.split(` `),{skipLookups:!0});return{prefix:r.prefix||X(),iconName:go(r.prefix,r.iconName)||r.iconName}}if(typeof e==`string`){var i=X();return{prefix:i,iconName:go(i,e)||e}}}},library:Bo,findIconDefinition:zo,toHtml:qa},Vo=function(){var e=(arguments.length>0&&arguments[0]!==void 0?arguments[0]:{}).autoReplaceSvgRoot,t=e===void 0?V:e;(Object.keys(Y.styles).length>0||G.autoFetchSvg)&&H&&G.autoReplaceSvg&&Z.dom.i2svg({node:t})};function Ho(e,t){return Object.defineProperty(e,"abstract",{get:t}),Object.defineProperty(e,"html",{get:function(){return e.abstract.map(function(e){return qa(e)})}}),Object.defineProperty(e,"node",{get:function(){if(H){var t=V.createElement(`div`);return t.innerHTML=e.html,t.children}}}),e}function Uo(e){var t=e.children,n=e.main,r=e.mask,i=e.attributes,a=e.styles,o=e.transform;if(Fa(o)&&n.found&&!r.found){var s={x:n.width/n.height/2,y:.5};i.style=Pa(z(z({},a),{},{"transform-origin":`${s.x+o.x/16}em ${s.y+o.y/16}em`}))}return[{tag:`svg`,attributes:i,children:t}]}function Wo(e){var t=e.prefix,n=e.iconName,r=e.children,i=e.attributes,a=e.symbol,o=a===!0?`${t}-${G.cssPrefix}-${n}`:a;return[{tag:`svg`,attributes:{style:`display: none;`},children:[{tag:`symbol`,attributes:z(z({},i),{},{id:o}),children:r}]}]}function Go(e){return[`aria-label`,`aria-labelledby`,`title`,`role`].some(function(t){return t in e})}function Ko(e){var t=e.icons,n=t.main,r=t.mask,i=e.prefix,a=e.iconName,o=e.transform,s=e.symbol,c=e.maskId,l=e.extra,u=e.watchable,d=u!==void 0&&u,f=r.found?r:n,p=f.width,m=f.height,h=[G.replacementClass,a?`${G.cssPrefix}-${a}`:``].filter(function(e){return l.classes.indexOf(e)===-1}).filter(function(e){return e!==``||!!e}).concat(l.classes).join(` `),g={children:[],attributes:z(z({},l.attributes),{},{"data-prefix":i,"data-icon":a,class:h,role:l.attributes.role||`img`,viewBox:`0 0 ${p} ${m}`})};!Go(l.attributes)&&!l.attributes[`aria-hidden`]&&(g.attributes[`aria-hidden`]=`true`),d&&(g.attributes[Xi]=``);var _=z(z({},g),{},{prefix:i,iconName:a,main:n,mask:r,maskId:c,transform:o,symbol:s,styles:z({},l.styles)}),v=r.found&&n.found?Ro(`generateAbstractMask`,_)||{children:[],attributes:{}}:Ro(`generateAbstractIcon`,_)||{children:[],attributes:{}},y=v.children,b=v.attributes;return _.children=y,_.attributes=b,s?Wo(_):Uo(_)}function qo(e){var t=e.content,n=e.width,r=e.height,i=e.transform,a=e.extra,o=e.watchable,s=o!==void 0&&o,c=z(z({},a.attributes),{},{class:a.classes.join(` `)});s&&(c[Xi]=``);var l=z({},a.styles);Fa(i)&&(l.transform=La({transform:i,startCentered:!0,width:n,height:r}),l[`-webkit-transform`]=l.transform);var u=Pa(l);u.length>0&&(c.style=u);var d=[];return d.push({tag:`span`,attributes:c,children:[t]}),d}function Jo(e){var t=e.content,n=e.extra,r=z(z({},n.attributes),{},{class:n.classes.join(` `)}),i=Pa(n.styles);i.length>0&&(r.style=i);var a=[];return a.push({tag:`span`,attributes:r,children:[t]}),a}var Yo=Y.styles;function Xo(e){var t=e[0],n=e[1],r=cr(e.slice(4),1)[0],i=null;return i=Array.isArray(r)?{tag:`g`,attributes:{class:`${G.cssPrefix}-${va.GROUP}`},children:[{tag:`path`,attributes:{class:`${G.cssPrefix}-${va.SECONDARY}`,fill:`currentColor`,d:r[0]}},{tag:`path`,attributes:{class:`${G.cssPrefix}-${va.PRIMARY}`,fill:`currentColor`,d:r[1]}}]}:{tag:`path`,attributes:{fill:`currentColor`,d:r}},{found:!0,width:t,height:n,icon:i}}var Zo={found:!1,width:512,height:512};function Qo(e,t){!aa&&!G.showMissingIcons&&e&&console.error(`Icon with name "${e}" and prefix "${t}" is missing.`)}function $o(e,t){var n=t;return t===`fa`&&G.styleDefault!==null&&(t=X()),new Promise(function(r,i){if(n===`fa`){var a=_o(e)||{};e=a.iconName||e,t=a.prefix||t}if(e&&t&&Yo[t]&&Yo[t][e]){var o=Yo[t][e];return r(Xo(o))}Qo(e,t),r(z(z({},Zo),{},{icon:G.showMissingIcons&&e&&Ro(`missingIconAbstract`)||{}}))})}var es=function(){},ts=G.measurePerformance&&Sr&&Sr.mark&&Sr.measure?Sr:{mark:es,measure:es},ns=`FA "7.3.1"`,rs=function(e){return ts.mark(`${ns} ${e} begins`),function(){return is(e)}},is=function(e){ts.mark(`${ns} ${e} ends`),ts.measure(`${ns} ${e}`,`${ns} ${e} begins`,`${ns} ${e} ends`)},as={begin:rs,end:is},os=function(){};function ss(e){return typeof(e.getAttribute?e.getAttribute(Xi):null)==`string`}function cs(e){var t=e.getAttribute?e.getAttribute($i):null,n=e.getAttribute?e.getAttribute(ea):null;return t&&n}function ls(e){return e&&e.classList&&e.classList.contains&&e.classList.contains(G.replacementClass)}function us(){return G.autoReplaceSvg===!0?hs.replace:hs[G.autoReplaceSvg]||hs.replace}function ds(e){return V.createElementNS(`http://www.w3.org/2000/svg`,e)}function fs(e){return V.createElement(e)}function ps(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).ceFn,n=t===void 0?e.tag===`svg`?ds:fs:t;if(typeof e==`string`)return V.createTextNode(e);var r=n(e.tag);return Object.keys(e.attributes||[]).forEach(function(t){r.setAttribute(t,e.attributes[t])}),(e.children||[]).forEach(function(e){r.appendChild(ps(e,{ceFn:n}))}),r}function ms(e){var t=` ${e.outerHTML} `;return t=`${t}Font Awesome fontawesome.com `,t}var hs={replace:function(e){var t=e[0];if(t.parentNode){if(e[1].forEach(function(e){t.parentNode.insertBefore(ps(e),t)}),t.getAttribute(Xi)===null&&G.keepOriginalSource){var n=V.createComment(ms(t));t.parentNode.replaceChild(n,t)}else t.remove()}},nest:function(e){var t=e[0],n=e[1];if(~ja(t).indexOf(G.replacementClass))return hs.replace(e);var r=RegExp(`${G.cssPrefix}-.*`);if(delete n[0].attributes.id,n[0].attributes.class){var i=n[0].attributes.class.split(` `).reduce(function(e,t){return t===G.replacementClass||t.match(r)?e.toSvg.push(t):e.toNode.push(t),e},{toNode:[],toSvg:[]});n[0].attributes.class=i.toSvg.join(` `),i.toNode.length===0?t.removeAttribute(`class`):t.setAttribute(`class`,i.toNode.join(` `))}var a=n.map(function(e){return qa(e)}).join(`
`);t.setAttribute(Xi,``),t.innerHTML=a}};function gs(e){e()}function _s(e,t){var n=typeof t==`function`?t:os;if(e.length===0)n();else{var r=gs;G.mutateApproach===na&&(r=br.requestAnimationFrame||gs),r(function(){var t=us(),r=as.begin(`mutate`);e.map(t),r(),n()})}}var vs=!1;function ys(){vs=!0}function bs(){vs=!1}var xs=null;function Ss(e){if(xr&&G.observeMutations){var t=e.treeCallback,n=t===void 0?os:t,r=e.nodeCallback,i=r===void 0?os:r,a=e.pseudoElementsCallback,o=a===void 0?os:a,s=e.observeMutationsRoot,c=s===void 0?V:s;xs=new xr(function(e){if(!vs){var t=X();Aa(e).forEach(function(e){if(e.type===`childList`&&e.addedNodes.length>0&&!ss(e.addedNodes[0])&&(G.searchPseudoElements&&o(e.target),n(e.target)),e.type===`attributes`&&e.target.parentNode&&G.searchPseudoElements&&o([e.target],!0),e.type===`attributes`&&ss(e.target)&&~_a.indexOf(e.attributeName)){if(e.attributeName===`class`&&cs(e.target)){var r=To(ja(e.target)),a=r.prefix,s=r.iconName;e.target.setAttribute($i,a||t),s&&e.target.setAttribute(ea,s)}else ls(e.target)&&i(e.target)}})}}),H&&xs.observe(c,{childList:!0,attributes:!0,characterData:!0,subtree:!0})}}function Cs(){xs&&xs.disconnect()}function ws(e){var t=e.getAttribute(`style`),n=[];return t&&(n=t.split(`;`).reduce(function(e,t){var n=t.split(`:`),r=n[0],i=n.slice(1);return r&&i.length>0&&(e[r]=i.join(`:`).trim()),e},{})),n}function Ts(e){var t=e.getAttribute(`data-prefix`),n=e.getAttribute(`data-icon`),r=e.innerText===void 0?``:e.innerText.trim(),i=To(ja(e));return i.prefix||=X(),t&&n&&(i.prefix=t,i.iconName=n),i.iconName&&i.prefix?i:(i.prefix&&r.length>0&&(i.iconName=ho(i.prefix,e.innerText)||mo(i.prefix,Za(e.innerText))),!i.iconName&&G.autoFetchSvg&&e.firstChild&&e.firstChild.nodeType===Node.TEXT_NODE&&(i.iconName=e.firstChild.data),i)}function Es(e){return Aa(e.attributes).reduce(function(e,t){return e.name!==`class`&&e.name!==`style`&&(e[t.name]=t.value),e},{})}function Ds(){return{iconName:null,prefix:null,transform:q,symbol:!1,mask:{iconName:null,prefix:null,rest:[]},maskId:null,extra:{classes:[],styles:{},attributes:{}}}}function Os(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{styleParser:!0},n=Ts(e),r=n.iconName,i=n.prefix,a=n.rest,o=Es(e),s=Io(`parseNodeAttributes`,{},e);return z({iconName:r,prefix:i,transform:q,mask:{iconName:null,prefix:null,rest:[]},maskId:null,symbol:!1,extra:{classes:a,styles:t.styleParser?ws(e):[],attributes:o}},s)}var ks=Y.styles;function As(e){var t=G.autoReplaceSvg===`nest`?Os(e,{styleParser:!1}):Os(e);return~t.extra.classes.indexOf(ha)?Ro(`generateLayersText`,e,t):Ro(`generateSvgReplacementMutation`,e,t)}function js(){return[].concat(B(Oi),B(Vi))}function Ms(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;if(!H)return Promise.resolve();var n=V.documentElement.classList,r=function(e){return n.add(`${ta}-${e}`)},i=function(e){return n.remove(`${ta}-${e}`)},a=G.autoFetchSvg?js():kr.concat(Object.keys(ks));a.includes(`fa`)||a.push(`fa`);var o=[`.${ha}:not([${Xi}])`].concat(a.map(function(e){return`.${e}:not([${Xi}])`})).join(`, `);if(o.length===0)return Promise.resolve();var s=[];try{s=Aa(e.querySelectorAll(o))}catch{}if(s.length>0)r(`pending`),i(`complete`);else return Promise.resolve();var c=as.begin(`onTree`),l=s.reduce(function(e,t){try{var n=As(t);n&&e.push(n)}catch(e){aa||e.name===`MissingIcon`&&console.error(e)}return e},[]);return new Promise(function(e,n){Promise.all(l).then(function(n){_s(n,function(){r(`active`),r(`complete`),i(`pending`),typeof t==`function`&&t(),c(),e()})}).catch(function(e){c(),n(e)})})}function Ns(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;As(e).then(function(e){e&&_s([e],t)})}function Ps(e){return function(t){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},r=(t||{}).icon?t:zo(t||{}),i=n.mask;return i&&=(i||{}).icon?i:zo(i||{}),e(r,z(z({},n),{},{mask:i}))}}var Fs=function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?q:n,i=t.symbol,a=i!==void 0&&i,o=t.mask,s=o===void 0?null:o,c=t.maskId,l=c===void 0?null:c,u=t.classes,d=u===void 0?[]:u,f=t.attributes,p=f===void 0?{}:f,m=t.styles,h=m===void 0?{}:m;if(e){var g=e.prefix,_=e.iconName,v=e.icon;return Ho(z({type:`icon`},e),function(){return Lo(`beforeDOMElementCreation`,{iconDefinition:e,params:t}),Ko({icons:{main:Xo(v),mask:s?Xo(s.icon):{found:!1,width:null,height:null,icon:{}}},prefix:g,iconName:_,transform:z(z({},q),r),symbol:a,maskId:l,extra:{attributes:p,styles:h,classes:d}})})}},Is={mixout:function(){return{icon:Ps(Fs)}},hooks:function(){return{mutationObserverCallbacks:function(e){return e.treeCallback=Ms,e.nodeCallback=Ns,e}}},provides:function(e){e.i2svg=function(e){var t=e.node,n=t===void 0?V:t,r=e.callback;return Ms(n,r===void 0?function(){}:r)},e.generateSvgReplacementMutation=function(e,t){var n=t.iconName,r=t.prefix,i=t.transform,a=t.symbol,o=t.mask,s=t.maskId,c=t.extra;return new Promise(function(t,l){Promise.all([$o(n,r),o.iconName?$o(o.iconName,o.prefix):Promise.resolve({found:!1,width:512,height:512,icon:{}})]).then(function(o){var l=cr(o,2),u=l[0],d=l[1];t([e,Ko({icons:{main:u,mask:d},prefix:r,iconName:n,transform:i,symbol:a,maskId:s,extra:c,watchable:!0})])}).catch(l)})},e.generateAbstractIcon=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.transform,a=e.styles,o=Pa(a);o.length>0&&(n.style=o);var s;return Fa(i)&&(s=Ro(`generateAbstractTransformGrouping`,{main:r,transform:i,containerWidth:r.width,iconWidth:r.width})),t.push(s||r.icon),{children:t,attributes:n}}}},Ls={mixout:function(){return{layer:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.classes,r=n===void 0?[]:n;return Ho({type:`layer`},function(){Lo(`beforeDOMElementCreation`,{assembler:e,params:t});var n=[];return e(function(e){Array.isArray(e)?e.map(function(e){n=n.concat(e.abstract)}):n=n.concat(e.abstract)}),[{tag:`span`,attributes:{class:[`${G.cssPrefix}-layers`].concat(B(r)).join(` `)},children:n}]})}}}},Rs={mixout:function(){return{counter:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.title,r=n===void 0?null:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return Ho({type:`counter`,content:e},function(){return Lo(`beforeDOMElementCreation`,{content:e,params:t}),Jo({content:e.toString(),title:r,extra:{attributes:s,styles:l,classes:[`${G.cssPrefix}-layers-counter`].concat(B(a))}})})}}}},zs={mixout:function(){return{text:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?q:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return Ho({type:`text`,content:e},function(){return Lo(`beforeDOMElementCreation`,{content:e,params:t}),qo({content:e,transform:z(z({},q),r),extra:{attributes:s,styles:l,classes:[`${G.cssPrefix}-layers-text`].concat(B(a))}})})}}},provides:function(e){e.generateLayersText=function(e,t){var n=t.transform,r=t.extra,i=null,a=null;if(Cr){var o=parseInt(getComputedStyle(e).fontSize,10),s=e.getBoundingClientRect();i=s.width/o,a=s.height/o}return Promise.resolve([e,qo({content:e.innerHTML,width:i,height:a,transform:n,extra:r,watchable:!0})])}}},Bs=RegExp(`"`,`ug`),Vs=[1105920,1112319],Hs=z(z(z(z({},{FontAwesome:{normal:`fas`,400:`fas`}}),Ti),Ki),Mi),Us=Object.keys(Hs).reduce(function(e,t){return e[t.toLowerCase()]=Hs[t],e},{}),Ws=Object.keys(Us).reduce(function(e,t){var n=Us[t];return e[t]=n[900]||B(Object.entries(n))[0][1],e},{});function Gs(e){return Za(B(e.replace(Bs,``))[0]||``)}function Ks(e){var t=e.getPropertyValue(`font-feature-settings`).includes(`ss01`),n=e.getPropertyValue(`content`).replace(Bs,``),r=n.codePointAt(0),i=r>=Vs[0]&&r<=Vs[1],a=n.length===2&&n[0]===n[1];return i||a||t}function qs(e,t){var n=e.replace(/^['"]|['"]$/g,``).toLowerCase(),r=parseInt(t),i=isNaN(r)?`normal`:r;return(Us[n]||{})[i]||Ws[n]}function Js(e,t){var n=`${Qi}${t.replace(`:`,`-`)}`;return new Promise(function(r,i){if(e.getAttribute(n)!==null)return r();var a=Aa(e.children).filter(function(e){return e.getAttribute(Zi)===t})[0],o=br.getComputedStyle(e,t),s=o.getPropertyValue(`font-family`),c=s.match(ga),l=o.getPropertyValue(`font-weight`),u=o.getPropertyValue(`content`);if(a&&!c)return e.removeChild(a),r();if(c&&u!==`none`&&u!==``){var d=o.getPropertyValue(`content`),f=qs(s,l),p=Gs(d),m=c[0].startsWith(`FontAwesome`),h=Ks(o),g=mo(f,p),_=g;if(m){var v=vo(p);v.iconName&&v.prefix&&(g=v.iconName,f=v.prefix)}if(g&&!h&&(!a||a.getAttribute($i)!==f||a.getAttribute(ea)!==_)){e.setAttribute(n,_),a&&e.removeChild(a);var y=Ds(),b=y.extra;b.attributes[Zi]=t,$o(g,f).then(function(i){var a=Ko(z(z({},y),{},{icons:{main:i,mask:yo()},prefix:f,iconName:_,extra:b,watchable:!0})),o=V.createElementNS(`http://www.w3.org/2000/svg`,`svg`);t===`::before`?e.insertBefore(o,e.firstChild):e.appendChild(o),o.outerHTML=a.map(function(e){return qa(e)}).join(`
`),e.removeAttribute(n),r()}).catch(i)}else r()}else r()})}function Ys(e){return Promise.all([Js(e,`::before`),Js(e,`::after`)])}function Xs(e){return e.parentNode!==document.head&&!~ra.indexOf(e.tagName.toUpperCase())&&!e.getAttribute(Zi)&&(!e.parentNode||e.parentNode.tagName!==`svg`)}var Zs=function(e){return!!e&&ia.some(function(t){return e.includes(t)})},Qs=function(e){if(!e)return[];var t=new Set,n=e.split(/,(?![^()]*\))/).map(function(e){return e.trim()});n=n.flatMap(function(e){return e.includes(`(`)?e:e.split(`,`).map(function(e){return e.trim()})});var r=nr(n),i;try{for(r.s();!(i=r.n()).done;){var a=i.value;if(Zs(a)){var o=ia.reduce(function(e,t){return e.replace(t,``)},a);o!==``&&o!==`*`&&t.add(o)}}}catch(e){r.e(e)}finally{r.f()}return t};function $s(e){var t=arguments.length>1&&arguments[1]!==void 0&&arguments[1];if(H){var n;if(t)n=e;else if(G.searchPseudoElementsFullScan)n=e.querySelectorAll(`*`);else{var r=new Set,i=nr(document.styleSheets),a;try{for(i.s();!(a=i.n()).done;){var o=a.value;try{var s=nr(o.cssRules),c;try{for(s.s();!(c=s.n()).done;){var l=c.value,u=nr(Qs(l.selectorText)),d;try{for(u.s();!(d=u.n()).done;){var f=d.value;r.add(f)}}catch(e){u.e(e)}finally{u.f()}}}catch(e){s.e(e)}finally{s.f()}}catch(e){G.searchPseudoElementsWarnings&&console.warn(`Font Awesome: cannot parse stylesheet: ${o.href} (${e.message})
If it declares any Font Awesome CSS pseudo-elements, they will not be rendered as SVG icons. Add crossorigin="anonymous" to the <link>, enable searchPseudoElementsFullScan for slower but more thorough DOM parsing, or suppress this warning by setting searchPseudoElementsWarnings to false.`)}}}catch(e){i.e(e)}finally{i.f()}if(!r.size)return;var p=Array.from(r).join(`, `);try{n=e.querySelectorAll(p)}catch{}}return new Promise(function(e,t){var r=Aa(n).filter(Xs).map(Ys),i=as.begin(`searchPseudoElements`);ys(),Promise.all(r).then(function(){i(),bs(),e()}).catch(function(){i(),bs(),t()})})}}var ec={hooks:function(){return{mutationObserverCallbacks:function(e){return e.pseudoElementsCallback=$s,e}}},provides:function(e){e.pseudoElements2svg=function(e){var t=e.node,n=t===void 0?V:t;G.searchPseudoElements&&$s(n)}}},tc=!1,nc={mixout:function(){return{dom:{unwatch:function(){ys(),tc=!0}}}},hooks:function(){return{bootstrap:function(){Ss(Io(`mutationObserverCallbacks`,{}))},noAuto:function(){Cs()},watch:function(e){var t=e.observeMutationsRoot;tc?bs():Ss(Io(`mutationObserverCallbacks`,{observeMutationsRoot:t}))}}}},rc=function(e){return e.toLowerCase().split(` `).reduce(function(e,t){var n=t.toLowerCase().split(`-`),r=n[0],i=n.slice(1).join(`-`);if(r&&i===`h`)return e.flipX=!0,e;if(r&&i===`v`)return e.flipY=!0,e;if(i=parseFloat(i),isNaN(i))return e;switch(r){case`grow`:e.size+=i;break;case`shrink`:e.size-=i;break;case`left`:e.x-=i;break;case`right`:e.x+=i;break;case`up`:e.y-=i;break;case`down`:e.y+=i;break;case`rotate`:e.rotate+=i}return e},{size:16,x:0,y:0,flipX:!1,flipY:!1,rotate:0})},ic={mixout:function(){return{parse:{transform:function(e){return rc(e)}}}},hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-transform`);return n&&(e.transform=rc(n)),e}}},provides:function(e){e.generateAbstractTransformGrouping=function(e){var t=e.main,n=e.transform,r=e.containerWidth,i=e.iconWidth,a={outer:{transform:`translate(${r/2} 256)`},inner:{transform:`${`translate(${n.x*32}, ${n.y*32}) `} ${`scale(${n.size/16*(n.flipX?-1:1)}, ${n.size/16*(n.flipY?-1:1)}) `} ${`rotate(${n.rotate} 0 0)`}`},path:{transform:`translate(${i/2*-1} -256)`}};return{tag:`g`,attributes:z({},a.outer),children:[{tag:`g`,attributes:z({},a.inner),children:[{tag:t.icon.tag,children:t.icon.children,attributes:z(z({},t.icon.attributes),a.path)}]}]}}}},ac={x:0,y:0,width:`100%`,height:`100%`};function oc(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!0;return e.attributes&&(e.attributes.fill||t)&&(e.attributes.fill=`black`),e}function sc(e){return e.tag===`g`?e.children:[e]}Fo([Ha,Is,Ls,Rs,zs,ec,nc,ic,{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-mask`),r=n?To(n.split(` `).map(function(e){return e.trim()})):yo();return r.prefix||=X(),e.mask=r,e.maskId=t.getAttribute(`data-fa-mask-id`),e}}},provides:function(e){e.generateAbstractMask=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.mask,a=e.maskId,o=e.transform,s=r.width,c=r.icon,l=i.width,u=i.icon,d=Ia({transform:o,containerWidth:l,iconWidth:s}),f={tag:`rect`,attributes:z(z({},ac),{},{fill:`white`})},p=c.children?{children:c.children.map(oc)}:{},m={tag:`g`,attributes:z({},d.inner),children:[oc(z({tag:c.tag,attributes:z(z({},c.attributes),d.path)},p))]},h={tag:`g`,attributes:z({},d.outer),children:[m]},g=`mask-${a||ka()}`,_=`clip-${a||ka()}`,v={tag:`mask`,attributes:z(z({},ac),{},{id:g,maskUnits:`userSpaceOnUse`,maskContentUnits:`userSpaceOnUse`}),children:[f,h]},y={tag:`defs`,children:[{tag:`clipPath`,attributes:{id:_},children:sc(u)},v]};return t.push(y,{tag:`rect`,attributes:z({fill:`currentColor`,"clip-path":`url(#${_})`,mask:`url(#${g})`},ac)}),{children:t,attributes:n}}}},{provides:function(e){var t=!1;br.matchMedia&&(t=br.matchMedia(`(prefers-reduced-motion: reduce)`).matches),e.missingIconAbstract=function(){var e=[],n={fill:`currentColor`},r={attributeType:`XML`,repeatCount:`indefinite`,dur:`2s`};e.push({tag:`path`,attributes:z(z({},n),{},{d:`M156.5,447.7l-12.6,29.5c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7C127.6,430.5,141.5,440,156.5,447.7z M40.6,272H8.5 c1.4,21.2,5.4,41.7,11.7,61.1L50,321.2C45.1,305.5,41.8,289,40.6,272z M40.6,240c1.4-18.8,5.2-37,11.1-54.1l-29.5-12.6 C14.7,194.3,10,216.7,8.5,240H40.6z M64.3,156.5c7.8-14.9,17.2-28.8,28.1-41.5L69.7,92.3c-13.7,15.6-25.5,32.8-34.9,51.5 L64.3,156.5z M397,419.6c-13.9,12-29.4,22.3-46.1,30.4l11.9,29.8c20.7-9.9,39.8-22.6,56.9-37.6L397,419.6z M115,92.4 c13.9-12,29.4-22.3,46.1-30.4l-11.9-29.8c-20.7,9.9-39.8,22.6-56.8,37.6L115,92.4z M447.7,355.5c-7.8,14.9-17.2,28.8-28.1,41.5 l22.7,22.7c13.7-15.6,25.5-32.9,34.9-51.5L447.7,355.5z M471.4,272c-1.4,18.8-5.2,37-11.1,54.1l29.5,12.6 c7.5-21.1,12.2-43.5,13.6-66.8H471.4z M321.2,462c-15.7,5-32.2,8.2-49.2,9.4v32.1c21.2-1.4,41.7-5.4,61.1-11.7L321.2,462z M240,471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6,29.5c21.1,7.5,43.5,12.2,66.8,13.6V471.4z M462,190.8c5,15.7,8.2,32.2,9.4,49.2h32.1 c-1.4-21.2-5.4-41.7-11.7-61.1L462,190.8z M92.4,397c-12-13.9-22.3-29.4-30.4-46.1l-29.8,11.9c9.9,20.7,22.6,39.8,37.6,56.9 L92.4,397z M272,40.6c18.8,1.4,36.9,5.2,54.1,11.1l12.6-29.5C317.7,14.7,295.3,10,272,8.5V40.6z M190.8,50 c15.7-5,32.2-8.2,49.2-9.4V8.5c-21.2,1.4-41.7,5.4-61.1,11.7L190.8,50z M442.3,92.3L419.6,115c12,13.9,22.3,29.4,30.5,46.1 l29.8-11.9C470,128.5,457.3,109.4,442.3,92.3z M397,92.4l22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6,29.5 C370.4,72.1,384.4,81.5,397,92.4z`})});var i=z(z({},r),{},{attributeName:`opacity`}),a={tag:`circle`,attributes:z(z({},n),{},{cx:`256`,cy:`364`,r:`28`}),children:[]};return t||a.children.push({tag:`animate`,attributes:z(z({},r),{},{attributeName:`r`,values:`28;14;28;28;14;28;`})},{tag:`animate`,attributes:z(z({},i),{},{values:`1;0;1;1;0;1;`})}),e.push(a),e.push({tag:`path`,attributes:z(z({},n),{},{opacity:`1`,d:`M263.7,312h-16c-6.6,0-12-5.4-12-12c0-71,77.4-63.9,77.4-107.8c0-20-17.8-40.2-57.4-40.2c-29.1,0-44.3,9.6-59.2,28.7 c-3.9,5-11.1,6-16.2,2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2c21.2-27.2,46.4-44.7,91.2-44.7c52.3,0,97.4,29.8,97.4,80.2 c0,67.6-77.4,63.5-77.4,107.8C275.7,306.6,270.3,312,263.7,312z`}),children:t?[]:[{tag:`animate`,attributes:z(z({},i),{},{values:`1;0;0;0;0;1;`})}]}),t||e.push({tag:`path`,attributes:z(z({},n),{},{opacity:`0`,d:`M232.5,134.5l7,168c0.3,6.4,5.6,11.5,12,11.5h9c6.4,0,11.7-5.1,12-11.5l7-168c0.3-6.8-5.2-12.5-12-12.5h-23 C237.7,122,232.2,127.7,232.5,134.5z`}),children:[{tag:`animate`,attributes:z(z({},i),{},{values:`0;0;1;1;0;0;`})}]}),{tag:`g`,attributes:{class:`missing`},children:e}}}},{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-symbol`);return e.symbol=n===null?!1:n===``||n,e}}}}],{mixoutsTo:Z}),Z.noAuto;var cc=Z.config;Z.library,Z.dom;var lc=Z.parse;Z.findIconDefinition,Z.toHtml;var uc=Z.icon;Z.layer,Z.text,Z.counter;function dc(e){return e-=0,e===e}function fc(e){return dc(e)?e:(e=e.replace(/[_-]+(.)?/g,(e,t)=>t?t.toUpperCase():``),e.charAt(0).toLowerCase()+e.slice(1))}var pc=(e,t)=>N.createElement(`stop`,{key:`${t}-${e.offset}`,offset:e.offset,stopColor:e.color,...e.opacity!==void 0&&{stopOpacity:e.opacity}});function mc(e){return e.charAt(0).toUpperCase()+e.slice(1)}var hc=new Map,gc=1e3;function _c(e){if(hc.has(e))return hc.get(e);let t={},n=0,r=e.length;for(;n<r;){let i=e.indexOf(`;`,n),a=i===-1?r:i,o=e.slice(n,a).trim();if(o){let e=o.indexOf(`:`);if(e>0){let n=o.slice(0,e).trim(),r=o.slice(e+1).trim();if(n&&r){let e=fc(n);t[e.startsWith(`webkit`)?mc(e):e]=r}}}n=a+1}if(hc.size===gc){let e=hc.keys().next().value;e&&hc.delete(e)}return hc.set(e,t),t}function vc(e,t,n={}){if(typeof t==`string`)return t;let r=(t.children||[]).map(t=>{let r=t;return(`fill`in n||n.gradientFill)&&t.tag===`path`&&`fill`in t.attributes&&(r={...t,attributes:{...t.attributes,fill:void 0}}),vc(e,r)}),i=t.attributes||{},a={};for(let[e,t]of Object.entries(i))switch(!0){case e===`class`:a.className=t;break;case e===`style`:a.style=_c(String(t));break;case e.startsWith(`aria-`):case e.startsWith(`data-`):a[e.toLowerCase()]=t;break;default:a[fc(e)]=t}let{style:o,role:s,"aria-label":c,gradientFill:l,...u}=n;if(o&&(a.style=a.style?{...a.style,...o}:o),s&&(a.role=s),c&&(a[`aria-label`]=c,a[`aria-hidden`]=`false`),l){a.fill=`url(#${l.id})`;let{type:t,stops:n=[],...i}=l;r.unshift(e(t===`linear`?`linearGradient`:`radialGradient`,{...i,id:l.id},n.map(pc)))}return e(t.tag,{...a,...u},...r)}var yc=vc.bind(null,N.createElement),bc=(e,t)=>{let n=(0,N.useId)();return e||(t?n:void 0)},xc=class{constructor(e=`react-fontawesome`){this.enabled=!1;let t=!1;try{t=typeof process<`u`&&!1}catch{}this.scope=e,this.enabled=t}log(...e){this.enabled&&console.log(`[${this.scope}]`,...e)}warn(...e){this.enabled&&console.warn(`[${this.scope}]`,...e)}error(...e){this.enabled&&console.error(`[${this.scope}]`,...e)}};typeof process<`u`&&{}.FA_VERSION;var Sc=`searchPseudoElementsFullScan`in cc&&typeof cc.searchPseudoElementsFullScan==`boolean`?`7.0.0`:`6.0.0`,Cc=Number.parseInt(Sc)>=7,wc=()=>Cc,Tc=`fa`,Q={beat:`fa-beat`,fade:`fa-fade`,beatFade:`fa-beat-fade`,bounce:`fa-bounce`,shake:`fa-shake`,spin:`fa-spin`,spinPulse:`fa-spin-pulse`,spinReverse:`fa-spin-reverse`,pulse:`fa-pulse`,flip360:`fa-flip-360`,buzz:`fa-buzz`,float:`fa-float`,jello:`fa-jello`,spinSnap:`fa-spin-snap`,spinSnap4:`fa-spin-snap-4`,spinSnap8:`fa-spin-snap-8`,swing:`fa-swing`,wag:`fa-wag`},Ec={left:`fa-pull-left`,right:`fa-pull-right`},Dc={90:`fa-rotate-90`,180:`fa-rotate-180`,270:`fa-rotate-270`},Oc={"2xs":`fa-2xs`,xs:`fa-xs`,sm:`fa-sm`,lg:`fa-lg`,xl:`fa-xl`,"2xl":`fa-2xl`,"1x":`fa-1x`,"2x":`fa-2x`,"3x":`fa-3x`,"4x":`fa-4x`,"5x":`fa-5x`,"6x":`fa-6x`,"7x":`fa-7x`,"8x":`fa-8x`,"9x":`fa-9x`,"10x":`fa-10x`},$={border:`fa-border`,fixedWidth:`fa-fw`,flip:`fa-flip`,flipHorizontal:`fa-flip-horizontal`,flipVertical:`fa-flip-vertical`,inverse:`fa-inverse`,rotateBy:`fa-rotate-by`,swapOpacity:`fa-swap-opacity`,widthAuto:`fa-width-auto`,canvasSquare:`fa-canvas-square`,canvasRoomy:`fa-canvas-roomy`},kc={default:`fa-layers`};function Ac(e){let t=cc.cssPrefix||cc.familyPrefix||Tc;return t===Tc?e:e.replace(new RegExp(String.raw`(?<=^|\s)${Tc}-`,`g`),`${t}-`)}function jc(e){let{beat:t,fade:n,beatFade:r,bounce:i,shake:a,spin:o,spinPulse:s,spinReverse:c,pulse:l,fixedWidth:u,inverse:d,border:f,flip:p,size:m,rotation:h,pull:g,swapOpacity:_,rotateBy:v,widthAuto:y,canvasSquare:b,canvasRoomy:x,flip360:S,buzz:C,float:ee,jello:te,spinSnap:w,spinSnap4:ne,spinSnap8:re,swing:ie,wag:T,className:ae}=e,E=[];return ae&&E.push(...ae.split(` `)),t&&E.push(Q.beat),n&&E.push(Q.fade),r&&E.push(Q.beatFade),i&&E.push(Q.bounce),a&&E.push(Q.shake),o&&E.push(Q.spin),c&&E.push(Q.spinReverse),s&&E.push(Q.spinPulse),l&&E.push(Q.pulse),u&&E.push($.fixedWidth),d&&E.push($.inverse),f&&E.push($.border),p===!0&&E.push($.flip),(p===`horizontal`||p===`both`)&&E.push($.flipHorizontal),(p===`vertical`||p===`both`)&&E.push($.flipVertical),m!=null&&E.push(Oc[m]),h!=null&&h!==0&&E.push(Dc[h]),g!=null&&E.push(Ec[g]),_&&E.push($.swapOpacity),wc()?(v&&E.push($.rotateBy),y&&E.push($.widthAuto),b&&E.push($.canvasSquare),x&&E.push($.canvasRoomy),S&&E.push(Q.flip360),C&&E.push(Q.buzz),ee&&E.push(Q.float),te&&E.push(Q.jello),w&&E.push(Q.spinSnap),ne&&E.push(Q.spinSnap4),re&&E.push(Q.spinSnap8),ie&&E.push(Q.swing),T&&E.push(Q.wag),(cc.cssPrefix||cc.familyPrefix||Tc)===Tc?E:E.map(Ac)):E}var Mc=e=>typeof e==`object`&&`icon`in e&&!!e.icon;function Nc(e){if(e)return Mc(e)?e:lc.icon(e)}function Pc(e){return Object.keys(e)}var Fc=new xc(`FontAwesomeIcon`),Ic={border:!1,className:``,mask:void 0,maskId:void 0,fixedWidth:!1,inverse:!1,flip:!1,icon:void 0,listItem:!1,pull:void 0,pulse:!1,rotation:void 0,rotateBy:!1,size:void 0,spin:!1,spinPulse:!1,spinReverse:!1,beat:!1,fade:!1,beatFade:!1,bounce:!1,shake:!1,symbol:!1,title:``,titleId:void 0,transform:void 0,swapOpacity:!1,widthAuto:!1,canvasSquare:!1,canvasRoomy:!1,flip360:!1,buzz:!1,float:!1,jello:!1,spinSnap:!1,spinSnap4:!1,spinSnap8:!1,swing:!1,wag:!1},Lc=new Set(Object.keys(Ic)),Rc=N.forwardRef((e,t)=>{let n={...Ic,...e},{icon:r,mask:i,symbol:a,title:o,titleId:s,maskId:c,transform:l}=n,u=bc(c,!!i),d=bc(s,!!o),f=Nc(r);if(!f)return Fc.error(`Icon lookup is undefined`,r),null;let p=jc(n),m=typeof l==`string`?lc.transform(l):l,h=Nc(i),g=uc(f,{...p.length>0&&{classes:p},...m&&{transform:m},...h&&{mask:h},symbol:a,title:o,titleId:d,maskId:u});if(!g)return Fc.error(`Could not find icon`,f),null;let{abstract:_}=g,v={ref:t};for(let e of Pc(n))Lc.has(e)||(v[e]=n[e]);return yc(_[0],v)});Rc.displayName=`FontAwesomeIcon`,`${kc.default}${$.fixedWidth}`;var zc={prefix:`fas`,iconName:`server`,icon:[448,512,[],`f233`,`M64 32C28.7 32 0 60.7 0 96l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64c0-35.3-28.7-64-64-64L64 32zm216 72a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm56 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zM64 288c-35.3 0-64 28.7-64 64l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64c0-35.3-28.7-64-64-64L64 288zm216 72a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm56 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z`]},Bc={prefix:`fas`,iconName:`shield-halved`,icon:[512,512,[`shield-alt`],`f3ed`,`M256 0c4.6 0 9.2 1 13.4 2.9L457.8 82.8c22 9.3 38.4 31 38.3 57.2-.5 99.2-41.3 280.7-213.6 363.2-16.7 8-36.1 8-52.8 0-172.4-82.5-213.1-264-213.6-363.2-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.9 1 251.4 0 256 0zm0 66.8l0 378.1c138-66.8 175.1-214.8 176-303.4l-176-74.6 0 0z`]},Vc={prefix:`fas`,iconName:`tower-broadcast`,icon:[576,512,[`broadcast-tower`],`f519`,`M87.9 11.5c-11.3-6.9-26.1-3.2-33 8.1-24.8 41-39 89.1-39 140.4s14.2 99.4 39 140.4c6.9 11.3 21.6 15 33 8.1s15-21.6 8.1-33C75.7 241.9 64 202.3 64 160S75.7 78.1 96.1 44.4c6.9-11.3 3.2-26.1-8.1-33zm400.1 0c-11.3 6.9-15 21.6-8.1 33 20.4 33.7 32.1 73.3 32.1 115.6s-11.7 81.9-32.1 115.6c-6.9 11.3-3.2 26.1 8.1 33s26.1 3.2 33-8.1c24.8-41 39-89.1 39-140.4S545.8 60.6 521 19.6c-6.9-11.3-21.6-15-33-8.1zM320 215.4c19.1-11.1 32-31.7 32-55.4 0-35.3-28.7-64-64-64s-64 28.7-64 64c0 23.7 12.9 44.4 32 55.4L256 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-264.6zM180.2 91c7.2-11.2 3.9-26-7.2-33.2s-26-3.9-33.2 7.2c-17.6 27.4-27.8 60-27.8 95s10.2 67.6 27.8 95c7.2 11.2 22 14.4 33.2 7.2s14.4-22 7.2-33.2c-12.8-19.9-20.2-43.6-20.2-69s7.4-49.1 20.2-69zM436.2 65c-7.2-11.2-22-14.4-33.2-7.2s-14.4 22-7.2 33.2c12.8 19.9 20.2 43.6 20.2 69s-7.4 49.1-20.2 69c-7.2 11.2-3.9 26 7.2 33.2s26 3.9 33.2-7.2c17.6-27.4 27.8-60 27.8-95s-10.2-67.6-27.8-95z`]},Hc=[{icon:{prefix:`fas`,iconName:`bolt`,icon:[448,512,[9889,`zap`],`f0e7`,`M338.8-9.9c11.9 8.6 16.3 24.2 10.9 37.8L271.3 224 416 224c13.5 0 25.5 8.4 30.1 21.1s.7 26.9-9.6 35.5l-288 240c-11.3 9.4-27.4 9.9-39.3 1.3s-16.3-24.2-10.9-37.8L176.7 288 32 288c-13.5 0-25.5-8.4-30.1-21.1s-.7-26.9 9.6-35.5l288-240c11.3-9.4 27.4-9.9 39.3-1.3z`]},titleKey:`login.feat1Title`,descKey:`login.feat1Desc`},{icon:Vc,titleKey:`login.feat2Title`,descKey:`login.feat2Desc`},{icon:zc,titleKey:`login.feat3Title`,descKey:`login.feat3Desc`},{icon:Bc,titleKey:`login.feat4Title`,descKey:`login.feat4Desc`}];function Uc({children:e,brandName:t,logoUrl:n}){let{t:r}=P();return(0,F.jsxs)(`div`,{className:`min-h-screen flex bg-[var(--bg-primary)] text-tx1`,children:[(0,F.jsxs)(`div`,{className:`hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 border-r border-brd bg-surface`,children:[(0,F.jsx)(`div`,{className:`absolute inset-0 pointer-events-none`,style:{backgroundImage:`radial-gradient(720px 420px at 15% 12%, rgba(14, 165, 233, 0.08), transparent 70%)`}}),(0,F.jsx)(`div`,{className:`relative z-10`,children:(0,F.jsxs)(`div`,{className:`flex items-center gap-3`,children:[(0,F.jsx)(`div`,{className:`relative flex-shrink-0`,children:(0,F.jsx)(`div`,{className:M(`relative w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border border-brd`,n?`bg-white p-1.5`:`bg-accent/10`),children:n?(0,F.jsx)(`img`,{src:n,alt:t,className:`w-full h-full object-contain`}):(0,F.jsx)(Rc,{icon:Vc,className:`text-accent`,style:{fontSize:20}})})}),(0,F.jsxs)(`div`,{children:[(0,F.jsx)(`h1`,{className:`text-lg font-bold font-display tracking-tight`,children:t}),(0,F.jsx)(`p`,{className:`text-xs text-tx3`,children:r(`login.tagline`)})]})]})}),(0,F.jsxs)(`div`,{className:`relative z-10 flex-1 flex flex-col justify-center max-w-md`,children:[(0,F.jsx)(`h2`,{className:`text-3xl font-bold font-display leading-tight mb-3 text-tx1`,children:r(`login.hero`)}),(0,F.jsx)(`p`,{className:`text-sm text-tx2 leading-relaxed mb-8`,children:r(`login.heroSub`)}),(0,F.jsx)(`div`,{className:`space-y-3`,children:Hc.map(e=>(0,F.jsxs)(`div`,{className:`flex items-start gap-3 p-3 rounded-lg bg-glass/60 border border-brd`,children:[(0,F.jsx)(`div`,{className:`icon-badge w-9 h-9 flex-shrink-0 mt-0.5`,children:(0,F.jsx)(Rc,{icon:e.icon,style:{fontSize:14}})}),(0,F.jsxs)(`div`,{children:[(0,F.jsx)(`p`,{className:`text-sm font-medium text-tx1`,children:r(e.titleKey)}),(0,F.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:r(e.descKey)})]})]},e.titleKey))})]}),(0,F.jsxs)(`div`,{className:`relative z-10 pt-4 border-t border-brd flex items-center justify-between text-xs text-tx3`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,F.jsx)(`span`,{className:`w-2 h-2 rounded-full bg-success`}),(0,F.jsx)(`span`,{children:r(`login.footerReady`)})]}),(0,F.jsxs)(`div`,{className:`flex items-center gap-2 font-mono`,children:[(0,F.jsx)(ae,{size:13,className:`text-accent`}),(0,F.jsx)(`span`,{children:`GPON · EPON · TR-069`})]})]})]}),(0,F.jsxs)(`div`,{className:`w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-y-auto`,children:[(0,F.jsxs)(`div`,{className:`lg:hidden fixed top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2`,children:[(0,F.jsx)(`div`,{className:M(`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border border-brd`,n?`bg-white p-1.5`:`bg-accent/10`),children:n?(0,F.jsx)(`img`,{src:n,alt:t,className:`w-full h-full object-contain`}):(0,F.jsx)(Rc,{icon:Vc,className:`text-accent`,style:{fontSize:18}})}),(0,F.jsx)(`h1`,{className:`text-base font-bold font-display`,children:t})]}),(0,F.jsx)(`div`,{className:`relative w-full max-w-md mt-20 lg:mt-0`,children:e})]})]})}function Wc(){let{t:e}=P(),[t,n]=(0,N.useState)(``),[r,i]=(0,N.useState)(``),[a,s]=(0,N.useState)(!1),[c,l]=(0,N.useState)(!1),[d,p]=(0,N.useState)(!1),{login:m,user:h,loading:g}=L(),_=Te(),[v,y]=(0,N.useState)(``),[b,x]=(0,N.useState)(null),[S,C]=(0,N.useState)(!1),[ee,te]=(0,N.useState)(``),[w,ne]=(0,N.useState)(!1),[re,T]=(0,N.useState)(!1),ae=window.location.hostname===`nms.salfa.my.id`||window.location.hostname===`localhost`||window.location.hostname===`127.0.0.1`;return(0,N.useEffect)(()=>{fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{y(e.nms_name||`FiberNMS`),x(e.logo_url||null)}).catch(()=>{y(`FiberNMS`)})},[]),g?null:h?(0,F.jsx)(we,{to:`/dashboard`,replace:!0}):(0,F.jsxs)(Uc,{brandName:v,logoUrl:b,children:[(0,F.jsxs)(nn,{bodyClassName:`p-6 sm:p-8`,children:[(0,F.jsx)(`h2`,{className:`text-xl font-semibold mb-1 font-display`,children:e(`login.signIn`)}),(0,F.jsx)(`p`,{className:`text-xs text-tx3 mb-6`,children:e(`login.subtitle`)}),(0,F.jsxs)(`form`,{onSubmit:async n=>{if(n.preventDefault(),l(!0),await m(t,r)){l(!1),p(!0),I.success(e(`login.welcome`));let t=L.getState().user;await new Promise(e=>setTimeout(e,550)),t?.is_super_admin?_(`/dashboard/admin`):_(`/dashboard`)}else{let t=L.getState(),n=t.errorCode?e(`error.${t.errorCode}`,{seconds:t.errorData?.retry_after}):t.error||e(`error.invalid_credentials`);I.error(n),l(!1)}},className:`space-y-5`,children:[(0,F.jsx)(fn,{label:e(`login.username`),type:`text`,value:t,onChange:e=>n(e.target.value),placeholder:e(`login.usernamePh`),className:`h-11`,autoFocus:!0,required:!0}),(0,F.jsx)(fn,{label:e(`login.password`),type:a?`text`:`password`,value:r,onChange:e=>i(e.target.value),placeholder:e(`login.passwordPh`),className:`h-11`,required:!0,suffix:(0,F.jsx)(`button`,{type:`button`,onClick:()=>s(!a),className:`hover:text-tx2 transition-colors`,children:a?(0,F.jsx)(f,{size:18}):(0,F.jsx)(u,{size:18})})}),(0,F.jsx)(dn,{type:`submit`,variant:`primary`,loading:c,disabled:c||d,className:M(`w-full h-11 glow-accent transition-colors duration-300`,d&&`cursor-default`),style:d?{background:`var(--color-success)`}:void 0,children:d?(0,F.jsxs)(`span`,{className:`inline-flex items-center gap-1.5 animate-check-pop`,children:[(0,F.jsx)(ie,{size:18,strokeWidth:3}),e(`login.success`)]}):e(c?`login.signingIn`:`login.signIn`)})]}),!ae&&!S&&(0,F.jsx)(`div`,{className:`text-center mt-4`,children:(0,F.jsxs)(`button`,{type:`button`,onClick:()=>{C(!0)},className:`text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1.5`,children:[(0,F.jsx)(o,{size:14}),e(`login.forgot`)]})}),(0,F.jsx)(`p`,{className:`text-center text-xs text-tx3 mt-6`,children:e(`login.secure`)})]}),S&&(0,F.jsxs)(nn,{className:`mt-4`,bodyClassName:`p-6 sm:p-8`,children:[(0,F.jsxs)(`div`,{className:`flex items-center gap-3 mb-6`,children:[(0,F.jsx)(`button`,{type:`button`,onClick:()=>{C(!1),T(!1),te(``)},className:`text-tx3 hover:text-tx2 transition-colors`,children:(0,F.jsx)(oe,{size:20})}),(0,F.jsx)(`h2`,{className:`text-xl font-semibold font-display`,children:e(`login.resetTitle`)})]}),re?(0,F.jsxs)(`div`,{className:`text-center py-4`,children:[(0,F.jsx)(`div`,{className:`w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4`,children:(0,F.jsxs)(`svg`,{width:`28`,height:`28`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,className:`text-success`,children:[(0,F.jsx)(`path`,{d:`M22 11.08V12a10 10 0 11-5.93-9.14`}),(0,F.jsx)(`polyline`,{points:`22 4 12 14.01 9 11.01`})]})}),(0,F.jsx)(`p`,{className:`text-sm text-tx2 mb-2`,children:e(`login.resetSent`)}),(0,F.jsx)(`p`,{className:`text-xs text-tx3`,children:e(`login.resetSentHint`)}),(0,F.jsx)(dn,{type:`button`,variant:`primary`,className:`mt-6`,onClick:()=>{C(!1),T(!1),te(``)},children:e(`login.backToLogin`)})]}):(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(`p`,{className:`text-sm text-tx3 mb-5`,children:e(`login.resetHint`)}),(0,F.jsxs)(`form`,{onSubmit:async t=>{t.preventDefault(),ne(!0);try{let t=await(await fetch(`/api/public/forgot-password`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({identifier:ee})})).json();t.success?(T(!0),I.success(e(`login.resetRequestSent`))):I.error(t.message||e(`error.generic`))}catch{I.error(e(`login.networkError`))}ne(!1)},className:`space-y-5`,children:[(0,F.jsx)(fn,{label:e(`login.username`),type:`text`,value:ee,onChange:e=>te(e.target.value),placeholder:e(`login.usernamePh`),className:`h-11`,autoFocus:!0,required:!0}),(0,F.jsx)(dn,{type:`submit`,variant:`primary`,loading:w,className:`w-full h-11 glow-accent`,children:e(w?`login.sending`:`login.sendReset`)})]})]})]})]})}var Gc=(0,N.lazy)(()=>O(()=>import(`./Dashboard-dptQbixk.js`).then(e=>({default:e.Dashboard})),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]))),Kc=(0,N.lazy)(()=>O(()=>import(`./AllOnus-CMzTLPsj.js`).then(e=>({default:e.AllOnus})),__vite__mapDeps([14,1,2,3,4,5,6,7,8,9,10,11,12,15,16,13]))),qc=(0,N.lazy)(()=>O(()=>import(`./ViewOnu-DRKaLA9N.js`).then(e=>({default:e.ViewOnu})),__vite__mapDeps([17,1,2,3,4,5,6,7,10,12,16,18,19]))),Jc=(0,N.lazy)(()=>O(()=>import(`./AddOnu-CX2NtnnQ.js`).then(e=>({default:e.AddOnu})),__vite__mapDeps([20,1,2,3,4,5,6,7,8,9,10]))),Yc=(0,N.lazy)(()=>O(()=>import(`./OltSettings-BV9QHEnN.js`).then(e=>({default:e.OltSettings})),__vite__mapDeps([21,1,2,3,4,5,6,7,8,9,10,12]))),Xc=(0,N.lazy)(()=>O(()=>import(`./MikrotikSettings-BeGFFF4N.js`).then(e=>({default:e.MikrotikSettings})),__vite__mapDeps([22,1,2,4,7,8,5,6,9,10,3,12]))),Zc=(0,N.lazy)(()=>O(()=>import(`./UserManagement-BibI1aRa.js`).then(e=>({default:e.UserManagement})),__vite__mapDeps([23,1,2,4,7,8,5,6,9,10,3,12]))),Qc=(0,N.lazy)(()=>O(()=>import(`./Customization-B7_Nw5Av.js`).then(e=>({default:e.Customization})),__vite__mapDeps([24,1,2,3,4,5,6,7,8,9,10,12]))),$c=(0,N.lazy)(()=>O(()=>import(`./RegisterWizard-Bix99N76.js`).then(e=>({default:e.RegisterWizard})),__vite__mapDeps([25,1,2,3,4,5,6,7,15,26]))),el=(0,N.lazy)(()=>O(()=>import(`./ProvisionWizard-DZ2ODH60.js`).then(e=>({default:e.ProvisionWizard})),__vite__mapDeps([27,1,2,3,4,5,6,7,8,9,10,15,26]))),tl=(0,N.lazy)(()=>O(()=>import(`./OltConfiguration-ChQGrN2Z.js`).then(e=>({default:e.OltConfiguration})),__vite__mapDeps([28,1,2,3,4,5,6,7,10,12,18]))),nl=(0,N.lazy)(()=>O(()=>import(`./MyProfile-QYep9_Vs.js`).then(e=>({default:e.MyProfile})),__vite__mapDeps([29,1,2,4,7,8,5,6,9,10,3,30]))),rl=(0,N.lazy)(()=>O(()=>import(`./AlertSettings-BrSin1-M.js`).then(e=>({default:e.AlertSettings})),__vite__mapDeps([31,1,2,4,5,6,8,9,10,3,30,7,12]))),il=(0,N.lazy)(()=>O(()=>import(`./FtthInfrastructure-DFM--91E.js`).then(e=>({default:e.FtthInfrastructure})),__vite__mapDeps([32,1,2,3,4,5,6,7,8,9,10,12,16]))),al=(0,N.lazy)(()=>O(()=>import(`./Templates-Am3dDJ18.js`).then(e=>({default:e.default})),__vite__mapDeps([33,1,2,3,4,5,6,7,8,9,10]))),ol=(0,N.lazy)(()=>O(()=>import(`./Tr069Profile-DZr1-L1e.js`).then(e=>({default:e.default})),__vite__mapDeps([34,1,2,4,7,8,5,6,9,10,3,12]))),sl=(0,N.lazy)(()=>O(()=>import(`./ActionLogs-Cl5TNeMz.js`).then(e=>({default:e.ActionLogs})),__vite__mapDeps([35,1,2,4,5,6,7,8,9,10,3,11]))),cl=(0,N.lazy)(()=>O(()=>import(`./Incidents-Drb6EQBM.js`).then(e=>({default:e.Incidents})),__vite__mapDeps([36,1,2,3,4,5,6,7,8,9,10]))),ll=(0,N.lazy)(()=>O(()=>import(`./IncidentDetail-BlLNQY1X.js`).then(e=>({default:e.IncidentDetail})),__vite__mapDeps([37,1,2,3,4,5,6,7,8,9,10,36]))),ul=(0,N.lazy)(()=>O(()=>import(`./AlertHistory-DJkQbRgw.js`).then(e=>({default:e.AlertHistory})),__vite__mapDeps([38,1,2,4,5,6,8,9,10,3]))),dl=(0,N.lazy)(()=>O(()=>import(`./Traffic-Bq-NDwOg.js`).then(e=>({default:e.Traffic})),__vite__mapDeps([39,1,2,4,5,6,7,8,9,10,3,11,18,19]))),fl=(0,N.lazy)(()=>O(()=>import(`./AiAgentSettings-DE-xcyon.js`).then(e=>({default:e.AiAgentSettings})),__vite__mapDeps([40,1,2,4,7,8,5,6,9,10,3]))),pl=(0,N.lazy)(()=>O(()=>import(`./CloudflareTunnel-5wAWEBRC.js`).then(e=>({default:e.CloudflareTunnel})),__vite__mapDeps([41,1,2,4,8,5,6,9,10,3]))),ml=(0,N.lazy)(()=>O(()=>import(`./GuidePage-Bj6cRnYY.js`).then(e=>({default:e.GuidePage})),__vite__mapDeps([42,1,2,4,8,5,6,9,10,3,11]))),hl=(0,N.lazy)(()=>O(()=>import(`./UnconfiguredOnus-Cgznym68.js`).then(e=>({default:e.UnconfiguredOnus})),__vite__mapDeps([43,1,2,3,4,5,6,7,8,9,10]))),gl=(0,N.lazy)(()=>O(()=>import(`./OnuWizard-BYK9cZxw.js`).then(e=>({default:e.OnuWizard})),__vite__mapDeps([44,1,2,3,4,5,6,7,8,9,10,26]))),_l=(0,N.lazy)(()=>O(()=>import(`./SystemUpdate-Cnih7vER.js`).then(e=>({default:e.SystemUpdate})),__vite__mapDeps([45,1,2,4,8,5,6,9,10,3]))),vl=(0,N.lazy)(()=>O(()=>import(`./OltLogs-YBEyFMNT.js`).then(e=>({default:e.OltLogs})),__vite__mapDeps([46,1,2,4,5,6,7,8,9,10,3]))),yl=(0,N.lazy)(()=>O(()=>import(`./AutoProvision-C1Pk2IK4.js`).then(e=>({default:e.AutoProvision})),__vite__mapDeps([47,1,2,4,8,5,6,9,10,3]))),bl=(0,N.lazy)(()=>O(()=>import(`./Reports-BFHURAFM.js`).then(e=>({default:e.Reports})),__vite__mapDeps([48,1,2,4,8,5,6,12]))),xl=(0,N.lazy)(()=>O(()=>import(`./Terminal-D6c0z2LX.js`).then(e=>({default:e.Terminal})),__vite__mapDeps([49,1,2,3,4,7,8,5,6,12,50]))),Sl={"/dashboard/onus/add":`add_onu`,"/dashboard/onus/register":`add_onu`,"/dashboard/onus/provision":`add_onu`,"/dashboard/onus/pre-config":`add_onu`,"/dashboard/onus/unconfigured":`add_onu`,"/dashboard/onus/wizard/register":`add_onu`,"/dashboard/onus/wizard/provision":`add_onu`,"/dashboard/onus/wizard/preconfig":`add_onu`,"/dashboard/settings/olts":`settings_ip_olts`,"/dashboard/settings/mikrotik":`settings_ip_olts`,"/dashboard/customization":`customization`,"/dashboard/users":`manage_users`,"/dashboard/templates":`manage_templates`,"/dashboard/templates/tr069-profile":`manage_tr069`,"/dashboard/logs":`manage_users`,"/dashboard/settings/alerts":`customization`,"/dashboard/settings/cloudflare":`super_admin`,"/dashboard/settings/update":`super_admin`,"/dashboard/settings/auto-provision":`settings_ip_olts`},Cl=[{pattern:/^\/dashboard\/settings\/olts\/\d+\/config$/,perm:`settings_ip_olts`}];function wl({children:e}){let{user:t,loading:n}=L(),{pathname:r}=Ce();if(n&&!t)return(0,F.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,F.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,F.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,F.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,F.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,F.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})});if(!t)return(0,F.jsx)(we,{to:`/`,replace:!0});if(t.must_change_password&&r!==`/dashboard/profile`)return(0,F.jsx)(we,{to:`/dashboard/profile`,replace:!0});let i=Sl[r];if(!i){for(let e of Cl)if(e.pattern.test(r)){i=e.perm;break}}if(i){if(i===`super_admin`){if(!t.is_super_admin&&!new Set(t.permissions||[]).has(`all_olt`))return(0,F.jsx)(we,{to:`/dashboard`,replace:!0})}else{let e=new Set(t.permissions||[]);if(!t.is_super_admin&&!e.has(`all_olt`)&&!e.has(i))return(0,F.jsx)(we,{to:`/dashboard`,replace:!0})}}return(0,F.jsx)(F.Fragment,{children:e})}function Tl(){let{fetchUser:e,user:t}=L();return(0,N.useEffect)(()=>{t&&(t.theme&&Rt.getState().set(t.theme,{persist:!1}),t.language&&Xe.changeLanguage(t.language))},[t]),(0,N.useEffect)(()=>{let t=window.location.pathname||`/`;t!==`/`&&t!==`/login`?e():L.setState({loading:!1}),fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{e.timezone&&Ye(e.timezone)}).catch(()=>{})},[e]),(0,F.jsx)(Yn,{children:(0,F.jsx)(N.Suspense,{fallback:(0,F.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,F.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,F.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,F.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,F.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,F.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})}),children:(0,F.jsxs)(ke,{children:[(0,F.jsx)(k,{path:`/`,element:(0,F.jsx)(we,{to:`/login`,replace:!0})}),(0,F.jsx)(k,{path:`/login`,element:(0,F.jsx)(Wc,{})}),(0,F.jsxs)(k,{path:`/dashboard`,element:(0,F.jsxs)(wl,{children:[(0,F.jsx)(Wn,{}),(0,F.jsx)(Jn,{})]}),children:[(0,F.jsx)(k,{index:!0,element:(0,F.jsx)(Gc,{})}),(0,F.jsx)(k,{path:`onus`,element:(0,F.jsx)(Kc,{})}),(0,F.jsx)(k,{path:`onus/add`,element:(0,F.jsx)(Jc,{})}),(0,F.jsx)(k,{path:`onus/register`,element:(0,F.jsx)($c,{})}),(0,F.jsx)(k,{path:`onus/provision`,element:(0,F.jsx)(el,{})}),(0,F.jsx)(k,{path:`onus/pre-config`,element:(0,F.jsx)(el,{manualMode:!0})}),(0,F.jsx)(k,{path:`onus/unconfigured`,element:(0,F.jsx)(hl,{})}),(0,F.jsx)(k,{path:`onus/wizard/register`,element:(0,F.jsx)(gl,{mode:`register`})}),(0,F.jsx)(k,{path:`onus/wizard/provision`,element:(0,F.jsx)(gl,{mode:`provision`})}),(0,F.jsx)(k,{path:`onus/wizard/preconfig`,element:(0,F.jsx)(gl,{mode:`preconfig`})}),(0,F.jsx)(k,{path:`onus/:id`,element:(0,F.jsx)(qc,{})}),(0,F.jsx)(k,{path:`all-onus/view-c3-r/gpon/:oltId/:frame/:slot/:onuNum`,element:(0,F.jsx)(qc,{})}),(0,F.jsx)(k,{path:`settings/olts`,element:(0,F.jsx)(Yc,{})}),(0,F.jsx)(k,{path:`settings/mikrotik`,element:(0,F.jsx)(Xc,{})}),(0,F.jsx)(k,{path:`settings/olts/:oltId/config`,element:(0,F.jsx)(tl,{})}),(0,F.jsx)(k,{path:`customization`,element:(0,F.jsx)(Qc,{})}),(0,F.jsx)(k,{path:`users`,element:(0,F.jsx)(Zc,{})}),(0,F.jsx)(k,{path:`profile`,element:(0,F.jsx)(nl,{})}),(0,F.jsx)(k,{path:`settings/alerts`,element:(0,F.jsx)(rl,{})}),(0,F.jsx)(k,{path:`settings/cloudflare`,element:(0,F.jsx)(pl,{})}),(0,F.jsx)(k,{path:`settings/ai`,element:(0,F.jsx)(fl,{})}),(0,F.jsx)(k,{path:`settings/auto-provision`,element:(0,F.jsx)(yl,{})}),(0,F.jsx)(k,{path:`alerts/history`,element:(0,F.jsx)(ul,{})}),(0,F.jsx)(k,{path:`incidents`,element:(0,F.jsx)(cl,{})}),(0,F.jsx)(k,{path:`incidents/:id`,element:(0,F.jsx)(ll,{})}),(0,F.jsx)(k,{path:`ftth`,element:(0,F.jsx)(il,{})}),(0,F.jsx)(k,{path:`templates`,element:(0,F.jsx)(al,{})}),(0,F.jsx)(k,{path:`templates/tr069-profile`,element:(0,F.jsx)(ol,{})}),(0,F.jsx)(k,{path:`traffic`,element:(0,F.jsx)(dl,{})}),(0,F.jsx)(k,{path:`logs`,element:(0,F.jsx)(sl,{})}),(0,F.jsx)(k,{path:`reports`,element:(0,F.jsx)(bl,{})}),(0,F.jsx)(k,{path:`terminal`,element:(0,F.jsx)(xl,{})}),(0,F.jsx)(k,{path:`guide`,element:(0,F.jsx)(ml,{})}),(0,F.jsx)(k,{path:`settings/update`,element:(0,F.jsx)(_l,{})}),(0,F.jsx)(k,{path:`olt-logs`,element:(0,F.jsx)(vl,{})})]}),(0,F.jsx)(k,{path:`*`,element:(0,F.jsx)(we,{to:`/`,replace:!0})})]})})})}var El=`true`,Dl=`false`,Ol=El===`true`,kl=Dl===`true`;function Al(e={}){let{immediate:t=!1,onNeedReload:n,onNeedRefresh:r,onOfflineReady:i,onRegistered:a,onRegisteredSW:o,onRegisterError:s}=e,c,l,u,d=async(e=!0)=>{await l,Ol||u?.()};async function f(){if(`serviceWorker`in navigator){if(c=await O(async()=>{let{Workbox:e}=await import(`./workbox-window.prod.es5-Bd17z0YL.js`);return{Workbox:e}},[]).then(({Workbox:e})=>new e(`/sw.js`,{scope:`/`,type:`classic`})).catch(e=>{s?.(e)}),!c)return;if(u=()=>{c?.messageSkipWaiting()},!kl){if(Ol)c.addEventListener(`activated`,e=>{(e.isUpdate||e.isExternal)&&(n?n():window.location.reload())}),c.addEventListener(`installed`,e=>{e.isUpdate||i?.()});else{let e=!1,t=()=>{e=!0,c?.addEventListener(`controlling`,e=>{e.isUpdate&&(n?n():window.location.reload())}),r?.()};c.addEventListener(`installed`,n=>{n.isUpdate===void 0?n.isExternal===void 0?!e&&i?.():n.isExternal?t():!e&&i?.():n.isUpdate||i?.()}),c.addEventListener(`waiting`,t)}}c.register({immediate:t}).then(e=>{o?o(`/sw.js`,e):a?.(e)}).catch(e=>{s?.(e)})}}return l=f(),d}var jl=Al({immediate:!0,onNeedRefresh(){jl(!0)}});zt();var Ml=new at({defaultOptions:{queries:{retry:1,staleTime:1e4,refetchOnWindowFocus:!1}}});(0,St.createRoot)(document.getElementById(`root`)).render((0,F.jsx)(N.StrictMode,{children:(0,F.jsx)(Ae,{children:(0,F.jsxs)(Je,{client:Ml,children:[(0,F.jsx)(Tl,{}),(0,F.jsx)(Ot,{}),(0,F.jsx)(jt,{})]})})}));export{L as C,vt as D,P as E,Rt as S,I as T,on as _,Tn as a,tn as b,_n as c,pn as d,fn as f,sn as g,cn as h,En as i,gn as l,ln as m,jn as n,xn as o,dn as p,An as r,bn as s,Mn as t,mn as u,an as v,At as w,Jt as x,nn as y};