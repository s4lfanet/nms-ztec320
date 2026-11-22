const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Dashboard-Dxj-9SIR.js","assets/rolldown-runtime-hePW80VL.js","assets/vendor-icons-aKeV-6xf.js","assets/vendor-react-Bmg0aVHh.js","assets/vendor-query-xEkvkhGm.js","assets/utils-Bnd678VS.js","assets/i18nInstance-DuAUdJZQ.js","assets/api-BHWR_UDG.js","assets/PageContainer-vYCuU3RG.js","assets/PageHeader-iANqwrOd.js","assets/Breadcrumb-CI1gBsPy.js","assets/shared-CqMLm4mV.js","assets/useHasPerm-DLH1FKok.js","assets/useStatusFlash-m1rEe0vj.js","assets/AllOnus-ZjIaobCx.js","assets/ftthTree-wH5JBsVx.js","assets/LocationPicker-CJY4tY4t.js","assets/ViewOnu-BBipb5Ht.js","assets/AreaChart-BD-6-73Z.js","assets/YAxis-BOEWL0cS.js","assets/AddOnu-B_XaTst5.js","assets/OltSettings-Dkri_rZj.js","assets/MikrotikSettings-C8MWBO7i.js","assets/UserManagement-Cyj4ROx2.js","assets/Customization-BWZSnDF9.js","assets/RegisterWizard-BdW8vJ03.js","assets/PortMapEditor-BYJkOuh_.js","assets/ProvisionWizard-KALrEiun.js","assets/OltConfiguration-C1JZmnxm.js","assets/MyProfile-ByW0kFGe.js","assets/PushDeviceCard-ty0476Bq.js","assets/AlertSettings-v0RZTF3j.js","assets/FtthInfrastructure-6kSQGcN8.js","assets/Templates-CGNnQKvl.js","assets/Tr069Profile-C1LyR3gU.js","assets/ActionLogs-bTmNDKCE.js","assets/AlertHistory-CtHNHMBe.js","assets/Traffic-Dy0TeaEb.js","assets/AiAgentSettings-rRV8CzJY.js","assets/CloudflareTunnel-CLb9pSOM.js","assets/GuidePage-ClRK7LVl.js","assets/UnconfiguredOnus-CYNc1DKM.js","assets/OnuWizard-DmHvjZz3.js","assets/SystemUpdate-BhINAB2W.js","assets/OltLogs-cguzEMr6.js","assets/AutoProvision-C5ok4L6s.js","assets/Reports-Bln518BL.js","assets/Terminal-WI5Nxn-G.js","assets/Terminal-TdnZ7DQy.css"])))=>i.map(i=>d[i]);
import{r as e,t}from"./rolldown-runtime-hePW80VL.js";import{$t as n,Et as r,Gt as i,Ht as a,Kt as o,Mt as s,N as c,On as l,P as u,Sn as d,T as f,Tt as p,U as m,Vt as h,a as g,at as _,b as v,cn as y,ct as b,d as x,dn as ee,fn as S,ft as te,gn as ne,gt as re,i as ie,j as ae,k as oe,kn as C,kt as se,m as w,mn as ce,n as T,nn as le,q as ue,rn as de,rt as fe,s as pe,sn as me,t as he,tt as ge,vn as _e,wn as ve,xt as ye,y as be,yn as xe,zt as Se}from"./vendor-icons-aKeV-6xf.js";import{a as Ce,c as we,f as E,i as Te,l as Ee,m as De,o as D,p as Oe,r as ke,s as Ae,t as je}from"./vendor-react-Bmg0aVHh.js";import{_ as Me,a as Ne,b as Pe,c as Fe,d as Ie,g as Le,h as O,i as Re,l as ze,m as Be,n as Ve,o as k,p as He,r as Ue,s as We,t as Ge,u as Ke,v as qe,x as Je,y as Ye}from"./vendor-query-xEkvkhGm.js";import{i as Xe,o as Ze,t as A}from"./utils-Bnd678VS.js";import{r as Qe,t as $e}from"./i18nInstance-DuAUdJZQ.js";import{n as et,t as tt}from"./api-BHWR_UDG.js";import{t as nt}from"./vendor-state-Deor3M6A.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var rt=class extends Fe{#e;#t;#n;constructor(e={}){super(),this.config=e,this.#e=new Set,this.#t=new Map,this.#n=0}build(e,t,n){let r=new Ue({client:e,mutationCache:this,mutationId:++this.#n,options:e.defaultMutationOptions(t),state:n});return this.add(r),r}add(e){this.#e.add(e);let t=it(e);if(typeof t==`string`){let n=this.#t.get(t);n?n.push(e):this.#t.set(t,[e])}this.notify({type:`added`,mutation:e})}remove(e){if(this.#e.delete(e)){let t=it(e);if(typeof t==`string`){let n=this.#t.get(t);if(n){if(n.length>1){let t=n.indexOf(e);t!==-1&&n.splice(t,1)}else n[0]===e&&this.#t.delete(t)}}}this.notify({type:`removed`,mutation:e})}canRun(e){let t=it(e);if(typeof t==`string`){let n=this.#t.get(t)?.find(e=>e.state.status===`pending`);return!n||n===e}return!0}runNext(e){let t=it(e);return typeof t==`string`?(this.#t.get(t)?.find(t=>t!==e&&t.state.isPaused))?.continue()??Promise.resolve():Promise.resolve()}clear(){k.batch(()=>{this.#e.forEach(e=>{this.notify({type:`removed`,mutation:e})}),this.#e.clear(),this.#t.clear()})}getAll(){return Array.from(this.#e)}find(e){let t={exact:!0,...e};return this.getAll().find(e=>He(t,e))}findAll(e={}){return this.getAll().filter(t=>He(e,t))}notify(e){k.batch(()=>{this.listeners.forEach(t=>{t(e)})})}resumePausedMutations(){let e=this.getAll().filter(e=>e.state.isPaused);return k.batch(()=>Promise.all(e.map(e=>e.continue().catch(O))))}};function it(e){return e.options.scope?.id}var at=class extends Fe{#e;constructor(e={}){super(),this.config=e,this.#e=new Map}build(e,t,n){let r=t.queryKey,i=t.queryHash??Ie(r,t),a=this.get(i);return a||(a=new Re({client:e,queryKey:r,queryHash:i,options:e.defaultQueryOptions(t),state:n,defaultOptions:e.getQueryDefaults(r)}),this.add(a)),a}add(e){this.#e.has(e.queryHash)||(this.#e.set(e.queryHash,e),this.notify({type:`added`,query:e}))}remove(e){let t=this.#e.get(e.queryHash);t&&(e.destroy(),t===e&&this.#e.delete(e.queryHash),this.notify({type:`removed`,query:e}))}clear(){k.batch(()=>{this.getAll().forEach(e=>{this.remove(e)})})}get(e){return this.#e.get(e)}getAll(){return[...this.#e.values()]}find(e){let t={exact:!0,...e};return this.getAll().find(e=>Be(t,e))}findAll(e={}){let t=this.getAll();return Object.keys(e).length>0?t.filter(t=>Be(e,t)):t}notify(e){k.batch(()=>{this.listeners.forEach(t=>{t(e)})})}onFocus(){k.batch(()=>{this.getAll().forEach(e=>{e.onFocus()})})}onOnline(){k.batch(()=>{this.getAll().forEach(e=>{e.onOnline()})})}},ot=class{#e;#t;#n;#r;#i;#a;#o;#s;constructor(e={}){this.#e=e.queryCache||new at,this.#t=e.mutationCache||new rt,this.#n=e.defaultOptions||{},this.#r=new Map,this.#i=new Map,this.#a=0}mount(){this.#a++,this.#a===1&&(this.#o=We.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onFocus())}),this.#s=Ne.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onOnline())}))}unmount(){this.#a--,this.#a===0&&(this.#o?.(),this.#o=void 0,this.#s?.(),this.#s=void 0)}isFetching(e){return this.#e.findAll({...e,fetchStatus:`fetching`}).length}isMutating(e){return this.#t.findAll({...e,status:`pending`}).length}getQueryData(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state.data}ensureQueryData(e){let t=this.defaultQueryOptions(e),n=this.#e.build(this,t),r=n.state.data;return r===void 0?this.fetchQuery(e):(e.revalidateIfStale&&n.isStaleByTime(Me(t.staleTime,n))&&this.prefetchQuery(t),Promise.resolve(r))}getQueriesData(e){return this.#e.findAll(e).map(({queryKey:e,state:t})=>[e,t.data])}setQueryData(e,t,n){let r=this.defaultQueryOptions({queryKey:e}),i=this.#e.get(r.queryHash)?.state.data,a=ze(t,i);if(a!==void 0)return this.#e.build(this,r).setData(a,{...n,manual:!0})}setQueriesData(e,t,n){return k.batch(()=>this.#e.findAll(e).map(({queryKey:e})=>[e,this.setQueryData(e,t,n)]))}getQueryState(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state}removeQueries(e){let t=this.#e;k.batch(()=>{t.findAll(e).forEach(e=>{t.remove(e)})})}resetQueries(e,t){let n=this.#e;return k.batch(()=>{let r=n.findAll(e),i=new Set(r);return r.forEach(e=>{e.reset()}),this.refetchQueries({type:`active`,predicate:e=>i.has(e)},t)})}cancelQueries(e,t={}){let n={revert:!0,...t},r=k.batch(()=>this.#e.findAll(e).map(e=>e.cancel(n)));return Promise.all(r).then(O).catch(O)}invalidateQueries(e,t={}){return k.batch(()=>(this.#e.findAll(e).forEach(e=>{e.invalidate()}),e?.refetchType===`none`?Promise.resolve():this.refetchQueries({...e,type:e?.refetchType??e?.type??`active`},t)))}refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=k.batch(()=>this.#e.findAll(e).filter(e=>!e.isDisabled()&&!e.isStatic()).map(e=>{let t=e.fetch(void 0,n);return n.throwOnError||(t=t.catch(O)),e.state.fetchStatus===`paused`?Promise.resolve():t}));return Promise.all(r).then(O)}async query(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t),r=n.isStaleByTime(Me(t.staleTime,n))?await n.fetch(t):n.state.data,i=t.select;return i?i(r):r}fetchQuery(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t);return n.isStaleByTime(Me(t.staleTime,n))?n.fetch(t):Promise.resolve(n.state.data)}prefetchQuery(e){return this.fetchQuery(e).then(O).catch(O)}infiniteQuery(e){return e._type=`infinite`,this.query(e)}fetchInfiniteQuery(e){return e._type=`infinite`,this.fetchQuery(e)}prefetchInfiniteQuery(e){return this.fetchInfiniteQuery(e).then(O).catch(O)}ensureInfiniteQueryData(e){return e._type=`infinite`,this.ensureQueryData(e)}resumePausedMutations(){return Ne.isOnline()?this.#t.resumePausedMutations():Promise.resolve()}getQueryCache(){return this.#e}getMutationCache(){return this.#t}getDefaultOptions(){return this.#n}setDefaultOptions(e){this.#n=e}setQueryDefaults(e,t){this.#r.set(Ke(e),{queryKey:e,defaultOptions:t})}getQueryDefaults(e){let t=[...this.#r.values()],n={};return t.forEach(t=>{Le(e,t.queryKey)&&Object.assign(n,t.defaultOptions)}),n}setMutationDefaults(e,t){this.#i.set(Ke(e),{mutationKey:e,defaultOptions:t})}getMutationDefaults(e){let t=[...this.#i.values()],n={};return t.forEach(t=>{Le(e,t.mutationKey)&&Object.assign(n,t.defaultOptions)}),n}defaultQueryOptions(e){if(e._defaulted)return e;let t={...this.#n.queries,...this.getQueryDefaults(e.queryKey),...e,_defaulted:!0};return t.queryHash||=Ie(t.queryKey,t),t.refetchOnReconnect===void 0&&(t.refetchOnReconnect=t.networkMode!==`always`),t.throwOnError===void 0&&(t.throwOnError=!!t.suspense),!t.networkMode&&t.persister&&(t.networkMode=`offlineFirst`),t.queryFn===qe&&(t.enabled=!1),t}defaultMutationOptions(e){return e?._defaulted?e:{...this.#n.mutations,...e?.mutationKey&&this.getMutationDefaults(e.mutationKey),...e,_defaulted:!0}}clear(){this.#e.clear(),this.#t.clear()}},st=(e,t,n,r)=>{let i=[n,{code:t,...r||{}}];if(e?.services?.logger?.forward)return e.services.logger.forward(i,`warn`,`react-i18next::`,!0);mt(i[0])&&(i[0]=`react-i18next:: ${i[0]}`),e?.services?.logger?.warn?e.services.logger.warn(...i):console?.warn&&console.warn(...i)},ct={},lt=(e,t,n,r)=>{mt(n)&&ct[n]||(mt(n)&&(ct[n]=new Date),st(e,t,n,r))},ut=(e,t)=>()=>{if(e.isInitialized)t();else{let n=()=>{setTimeout(()=>{e.off(`initialized`,n)},0),t()};e.on(`initialized`,n)}},dt=(e,t,n)=>{e.loadNamespaces(t,ut(e,n))},ft=(e,t,n,r)=>{if(mt(n)&&(n=[n]),e.options.preload&&e.options.preload.indexOf(t)>-1)return dt(e,n,r);n.forEach(t=>{e.options.ns.indexOf(t)<0&&e.options.ns.push(t)}),e.loadLanguages(t,ut(e,r))},pt=(e,t,n={})=>!t.languages||!t.languages.length?(lt(t,`NO_LANGUAGES`,`i18n.languages were undefined or empty`,{languages:t.languages}),!0):t.hasLoadedNamespace(e,{lng:n.lng,precheck:(t,r)=>{if(n.bindI18n&&n.bindI18n.indexOf(`languageChanging`)>-1&&t.services.backendConnector.backend&&t.isLanguageChangingTo&&!r(t.isLanguageChangingTo,e))return!1}}),mt=e=>typeof e==`string`,ht=e=>typeof e==`object`&&!!e,j=e(C()),gt=(0,j.createContext)(),_t=class{constructor(){this.usedNamespaces={}}addUsedNamespaces(e){e.forEach(e=>{this.usedNamespaces[e]||(this.usedNamespaces[e]=!0)})}getUsedNamespaces(){return Object.keys(this.usedNamespaces)}},vt=t((e=>{var t=C();function n(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var r=typeof Object.is==`function`?Object.is:n,i=t.useState,a=t.useEffect,o=t.useLayoutEffect,s=t.useDebugValue;function c(e,t){var n=t(),r=i({inst:{value:n,getSnapshot:t}}),c=r[0].inst,u=r[1];return o(function(){c.value=n,c.getSnapshot=t,l(c)&&u({inst:c})},[e,n,t]),a(function(){return l(c)&&u({inst:c}),e(function(){l(c)&&u({inst:c})})},[e]),s(n),n}function l(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!r(e,n)}catch{return!0}}function u(e,t){return t()}var d=typeof window>`u`||window.document===void 0||window.document.createElement===void 0?u:c;e.useSyncExternalStore=t.useSyncExternalStore===void 0?d:t.useSyncExternalStore})),yt=t(((e,t)=>{t.exports=vt()})),bt=yt(),xt={t:(e,t)=>{if(mt(t))return t;if(ht(t)&&mt(t.defaultValue))return t.defaultValue;if(typeof e==`function`)return``;if(Array.isArray(e)){let t=e[e.length-1];return typeof t==`function`?``:t}return e},ready:!1},St=()=>()=>{},M=(e,t={})=>{let{i18n:n}=t,{i18n:r,defaultNS:i}=(0,j.useContext)(gt)||{},a=n||r||$e();a&&!a.reportNamespaces&&(a.reportNamespaces=new _t),a||lt(a,`NO_I18NEXT_INSTANCE`,`useTranslation: You will need to pass in an i18next instance by using initReactI18next`);let o=(0,j.useMemo)(()=>({...Qe(),...a?.options?.react,...t}),[a,t]),{useSuspense:s,keyPrefix:c}=o,l=e||i||a?.options?.defaultNS,u=mt(l)?[l]:l||[`translation`],d=(0,j.useMemo)(()=>u,u);a?.reportNamespaces?.addUsedNamespaces?.(d);let f=(0,j.useRef)(0),p=(0,j.useCallback)(e=>{if(!a)return St;let{bindI18n:t,bindI18nStore:n}=o,r=()=>{f.current+=1,e()};return t&&a.on(t,r),n&&a.store.on(n,r),()=>{t&&t.split(` `).forEach(e=>a.off(e,r)),n&&n.split(` `).forEach(e=>a.store.off(e,r))}},[a,o]),m=(0,j.useRef)(),h=(0,j.useCallback)(()=>{if(!a)return xt;let e=!!(a.isInitialized||a.initializedStoreOnce)&&d.every(e=>pt(e,a,o)),n=t.lng||a.language,r=f.current,i=m.current;if(i&&i.ready===e&&i.lng===n&&i.keyPrefix===c&&i.revision===r)return i;let s={t:a.getFixedT(n,o.nsMode===`fallback`?d:d[0],c),ready:e,lng:n,keyPrefix:c,revision:r};return m.current=s,s},[a,d,c,o,t.lng]),[g,_]=(0,j.useState)(0),{t:v,ready:y}=(0,bt.useSyncExternalStore)(p,h,h);(0,j.useEffect)(()=>{if(a&&!y&&!s){let e=()=>_(e=>e+1);t.lng?ft(a,t.lng,d,e):dt(a,d,e)}},[a,t.lng,d,y,s,g]);let b=a||{},x=(0,j.useRef)(null),ee=(0,j.useRef)(),S=e=>{let t=Object.getOwnPropertyDescriptors(e);t.__original&&delete t.__original;let n=Object.create(Object.getPrototypeOf(e),t);if(!Object.prototype.hasOwnProperty.call(n,`__original`))try{Object.defineProperty(n,"__original",{value:e,writable:!1,enumerable:!1,configurable:!1})}catch{}return n},te=(0,j.useMemo)(()=>{let e=b,t=e?.language,n=e;e&&(x.current&&x.current.__original===e&&ee.current===t?n=x.current:(n=S(e),x.current=n,ee.current=t));let r=!y&&!s?(...e)=>(lt(a,`USE_T_BEFORE_READY`,`useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t.`),v(...e)):v,i=[r,n,y];return i.t=r,i.i18n=n,i.ready=y,i},[v,b,y,b.resolvedLanguage,b.language,b.languages]);if(a&&s&&!y)throw new Promise(e=>{let n=()=>e();t.lng?ft(a,t.lng,d,n):dt(a,d,n)});return te},Ct=Oe(),N=Je(),wt=4e3,Tt=4,Et=null;function P(e,t=`info`,n=wt){Et?.({type:t,message:e,duration:n})}P.success=e=>P(e,`success`),P.error=e=>P(e,`error`,5e3),P.warning=e=>P(e,`warning`),P.info=e=>P(e,`info`);var Dt={success:(0,N.jsx)(de,{size:18,className:`text-success`}),error:(0,N.jsx)(n,{size:18,className:`text-danger`}),warning:(0,N.jsx)(x,{size:18,className:`text-warning`}),info:(0,N.jsx)(r,{size:18,className:`text-accent`})},Ot={success:`border-success/30 bg-success/10`,error:`border-danger/30 bg-danger/10`,warning:`border-warning/30 bg-warning/10`,info:`border-accent/30 bg-accent/10`};function kt(){let[e,t]=(0,j.useState)([]),n=(0,j.useRef)({}),r=(0,j.useCallback)(e=>{t(t=>t.map(t=>t.id===e?{...t,exiting:!0}:t)),setTimeout(()=>{t(t=>t.filter(t=>t.id!==e)),delete n.current[e]},250)},[]),i=(0,j.useCallback)(e=>{t(t=>{if(t.find(t=>t.type===e.type&&t.message===e.message&&!t.exiting))return t;let i=`${e.type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,a=e.duration||wt;n.current[i]=setTimeout(()=>r(i),a);let o=[...t,{...e,id:i}];return o.length<=Tt?o:(o.slice(0,o.length-Tt).forEach(e=>{clearTimeout(n.current[e.id]),delete n.current[e.id]}),o.slice(o.length-Tt))})},[r]);return(0,j.useEffect)(()=>(Et=i,()=>{Et=null}),[i]),(0,j.useEffect)(()=>()=>{Object.values(n.current).forEach(clearTimeout)},[]),(0,N.jsx)(`div`,{className:`fixed top-20 left-4 right-4 sm:left-auto sm:w-full max-w-sm z-[9999] flex flex-col gap-2 pointer-events-none`,children:e.map(e=>(0,N.jsxs)(`div`,{className:A(`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl`,`shadow-lg transition-all duration-250`,Ot[e.type],e.exiting?`opacity-0 translate-x-4`:`animate-slide-in opacity-100`),children:[(0,N.jsx)(`span`,{className:`flex-shrink-0`,children:Dt[e.type]}),(0,N.jsx)(`span`,{className:`text-sm font-medium flex-1 text-tx1`,children:e.message}),(0,N.jsx)(`button`,{onClick:()=>r(e.id),className:`flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`,children:(0,N.jsx)(T,{size:14})})]},e.id))})}var At=null;function jt(e){return At?At(e):Promise.resolve(window.confirm(e.message))}function Mt(){let[e,t]=(0,j.useState)(!1),[n,r]=(0,j.useState)({title:``,message:``}),[i,a]=(0,j.useState)(null);(0,j.useEffect)(()=>(At=e=>(r(e),t(!0),new Promise(e=>a(()=>e))),()=>{At=null}),[]);let o=e=>{t(!1),i?.(e)};if(!e)return null;let s=n.variant===`danger`?`bg-danger hover:bg-danger/80 text-white`:n.variant===`warning`?`bg-warning hover:bg-warning/80 text-black`:`bg-accent hover:bg-accent-hover text-white`;return(0,N.jsxs)(`div`,{className:`fixed inset-0 z-[9998] flex items-center justify-center p-4`,children:[(0,N.jsx)(`div`,{className:`modal-overlay`,onClick:()=>o(!1)}),(0,N.jsxs)(`div`,{className:`relative glass-card p-6 w-full max-w-md animate-fade-in`,children:[(0,N.jsx)(`button`,{onClick:()=>o(!1),className:`absolute top-4 right-4 text-tx3 hover:text-tx1`,children:(0,N.jsx)(T,{size:18})}),(0,N.jsxs)(`div`,{className:`flex items-center gap-3 mb-4`,children:[(0,N.jsx)(`div`,{className:A(`w-10 h-10 rounded-xl flex items-center justify-center`,n.variant===`danger`?`bg-danger/15 text-danger`:`bg-warning/15 text-warning`),children:(0,N.jsx)(x,{size:20})}),(0,N.jsx)(`h3`,{className:`text-lg font-semibold`,children:n.title})]}),(0,N.jsx)(`p`,{className:`text-tx2 text-sm mb-6`,children:n.message}),(0,N.jsxs)(`div`,{className:`flex justify-end gap-3`,children:[(0,N.jsx)(`button`,{onClick:()=>o(!1),className:`px-4 py-2 rounded-xl text-sm hover:bg-glass transition-colors`,children:n.cancelLabel||`Cancel`}),(0,N.jsx)(`button`,{onClick:()=>o(!0),className:A(`px-4 py-2 rounded-xl text-sm font-medium transition-all`,s),children:n.confirmLabel||`Confirm`})]})]})]})}var F=nt(e=>({user:null,loading:!0,error:null,fetchUser:async()=>{try{e({loading:!0,error:null});let{user:t}=await et.me();e({user:t,loading:!1})}catch{e({user:null,loading:!1})}},login:async(t,n)=>{try{e({error:null,errorCode:void 0,errorData:void 0});let{user:r}=await et.login(t,n);return e({user:r}),!0}catch(t){return e({error:t instanceof Error?t.message:`Login failed`,errorCode:t instanceof tt?t.errorCode:void 0,errorData:t instanceof tt?t.data:void 0}),!1}},logout:async()=>{e({user:null}),et.logout().catch(()=>{})}})),Nt=`theme`,Pt=[`dark`,`light`,`system`],Ft=()=>window.matchMedia(`(prefers-color-scheme: light)`);function It(e){return e===`system`?Ft().matches?`light`:`dark`:e}function Lt(e,t=!1){let n=document.documentElement,r=()=>n.classList.toggle(`light`,e===`light`),i=n.classList.contains(`light`)!==(e===`light`),a=document,o=window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(!t||!i||o||!a.startViewTransition){r();return}n.classList.add(`theme-switching`);let s=()=>n.classList.remove(`theme-switching`);a.startViewTransition(r).finished.then(s,s)}function Rt(e){F.getState().user&&fetch(`/api/profile`,{method:`POST`,headers:{"Content-Type":`application/json`},credentials:`include`,body:JSON.stringify({theme:e})}).catch(()=>{})}var zt=nt((e,t)=>({theme:`dark`,resolved:`dark`,set:(t,n)=>{Pt.includes(t)||(t=`system`);let r=It(t);Lt(r,!0),localStorage.setItem(Nt,t),e({theme:t,resolved:r}),n?.persist!==!1&&Rt(t)},toggle:()=>{let e=t().resolved===`light`?`dark`:`light`;t().set(e)}}));function Bt(){let e=localStorage.getItem(Nt),t=e&&Pt.includes(e)?e:`system`,n=It(t);Lt(n),zt.setState({theme:t,resolved:n}),Ft().addEventListener(`change`,()=>{let{theme:e}=zt.getState();if(e!==`system`)return;let t=It(`system`);Lt(t,!0),zt.setState({resolved:t})})}var Vt=[{labelKey:`nav.dashboard`,icon:(0,N.jsx)(ye,{size:20}),path:`/dashboard`,permission:`view_dashboard`},{labelKey:`nav.onu`,icon:(0,N.jsx)(m,{size:20}),permission:`view_dashboard`,children:[{labelKey:`nav.allOnus`,path:`/dashboard/onus`},{labelKey:`nav.unconfigured`,path:`/dashboard/onus/unconfigured`,permission:`add_onu`},{labelKey:`nav.provision`,path:`/dashboard/onus/provision`,permission:`add_onu`},{labelKey:`nav.preconfig`,path:`/dashboard/onus/pre-config`,permission:`add_onu`},{labelKey:`nav.registerWizard`,path:`/dashboard/onus/register`,permission:`add_onu`}]},{labelKey:`nav.templates`,icon:(0,N.jsx)(Se,{size:20}),permission:`manage_templates`,children:[{labelKey:`nav.templates`,path:`/dashboard/templates`,permission:`manage_templates`},{labelKey:`nav.tr069Profile`,path:`/dashboard/templates/tr069-profile`,permission:`manage_tr069`}]},{labelKey:`nav.traffic`,icon:(0,N.jsx)(l,{size:20}),path:`/dashboard/traffic`,permission:`view_dashboard`},{labelKey:`nav.infrastructure`,icon:(0,N.jsx)(ae,{size:20}),permission:`view_dashboard`,children:[{labelKey:`nav.oltSettings`,path:`/dashboard/settings/olts`,permission:`settings_ip_olts`},{labelKey:`nav.mikrotik`,path:`/dashboard/settings/mikrotik`,permission:`settings_ip_olts`},{labelKey:`nav.autoProvision`,path:`/dashboard/settings/auto-provision`,permission:`settings_ip_olts`},{labelKey:`nav.ftthOverview`,path:`/dashboard/ftth`,permission:`view_dashboard`},{labelKey:`nav.ponPorts`,path:`/dashboard/ftth?tab=pon`,permission:`view_dashboard`},{labelKey:`nav.otb`,path:`/dashboard/ftth?tab=otb`,permission:`view_dashboard`},{labelKey:`nav.odc`,path:`/dashboard/ftth?tab=odc`,permission:`view_dashboard`},{labelKey:`nav.odp`,path:`/dashboard/ftth?tab=odp`,permission:`view_dashboard`},{labelKey:`nav.ftthMap`,path:`/dashboard/ftth?tab=map`,permission:`view_dashboard`}]},{labelKey:`nav.system`,icon:(0,N.jsx)(f,{size:20}),permission:void 0,children:[{labelKey:`nav.customization`,path:`/dashboard/customization`,permission:`customization`},{labelKey:`nav.users`,path:`/dashboard/users`,permission:`manage_users`},{labelKey:`nav.alertSettings`,path:`/dashboard/settings/alerts`,permission:`customization`},{labelKey:`nav.cloudflare`,path:`/dashboard/settings/cloudflare`,permission:`super_admin`},{labelKey:`nav.aiAgent`,path:`/dashboard/settings/ai`,permission:`super_admin`},{labelKey:`nav.systemUpdate`,path:`/dashboard/settings/update`,permission:`super_admin`},{labelKey:`nav.alertHistory`,path:`/dashboard/alerts/history`,permission:`view_dashboard`}]},{labelKey:`nav.guide`,icon:(0,N.jsx)(ne,{size:20}),path:`/dashboard/guide`},{labelKey:`nav.activityLog`,icon:(0,N.jsx)(u,{size:20}),path:`/dashboard/logs`,permission:`manage_users`},{labelKey:`nav.oltLogs`,icon:(0,N.jsx)(_,{size:20}),path:`/dashboard/olt-logs`,permission:`view_dashboard`},{labelKey:`nav.reports`,icon:(0,N.jsx)(Se,{size:20}),path:`/dashboard/reports`,permission:`view_onus`},{labelKey:`nav.terminal`,icon:(0,N.jsx)(be,{size:20}),path:`/dashboard/terminal`,permission:`olt_terminal`}];function Ht(e){if(!e)return[];let t=new Set(e.permissions||[]),n=n=>!n||e.is_super_admin?!0:n===`super_admin`?t.has(`all_olt`):t.has(`all_olt`)?!0:t.has(n),r=Vt.map(e=>({...e,children:e.children?.map(e=>({...e}))}));return r=r.filter(e=>n(e.permission)?!e.children||e.children.some(e=>n(e.permission)):!1),r}function Ut({collapsed:e,mobileOpen:t,onToggle:n,onMobileClose:r}){let{t:i}=M(),{user:a}=F(),o=Ee(),s=a?.sidebar_name||`Salfanet NMS`,c=new Set(a?.permissions||[]),l=e=>!e||a?.is_super_admin?!0:e===`super_admin`?c.has(`all_olt`):c.has(`all_olt`)?!0:c.has(e),u=Ht(a),[d,f]=(0,j.useState)(()=>{let e={},t=window.location.pathname;for(let n of u)n.children?.some(e=>t.startsWith(e.path.split(`?`)[0]))&&(e[n.labelKey]=!0);return e}),p=e=>{f(t=>({...t,[e]:!t[e]}))},m=t||!e;return(0,N.jsxs)(N.Fragment,{children:[t&&(0,N.jsx)(`div`,{className:`fixed inset-0 bg-black/50 z-40 lg:hidden`,onClick:r}),(0,N.jsxs)(`aside`,{className:A(`sidebar-panel fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out`,`bg-surface/95 backdrop-blur-xl border-r border-brd`,e?`lg:w-[70px]`:`lg:w-[260px]`,`w-[260px]`,t?`sidebar-open`:`sidebar-closed`),children:[(0,N.jsxs)(`div`,{className:A(`flex items-center h-16 px-4 border-b border-brd`,m?`justify-between`:`justify-center`),children:[m?(0,N.jsxs)(`div`,{className:`flex items-center gap-2.5 min-w-0`,children:[(0,N.jsx)(`div`,{className:A(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,N.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,N.jsx)(he,{size:18,className:`text-white`})}),(0,N.jsx)(`span`,{className:`text-lg font-bold tracking-tight truncate`,children:s})]}):(0,N.jsx)(`div`,{className:A(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,N.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,N.jsx)(he,{size:18,className:`text-white`})}),m&&(0,N.jsx)(`button`,{onClick:n,className:`p-1.5 rounded-lg hover:bg-glass transition-colors max-lg:hidden flex-shrink-0`,children:(0,N.jsx)(y,{size:18})}),m&&(0,N.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass transition-colors lg:hidden flex-shrink-0`,children:(0,N.jsx)(T,{size:18})})]}),!m&&(0,N.jsx)(`button`,{onClick:n,className:`hidden lg:flex items-center justify-center w-full py-2 text-tx3 hover:text-tx1 hover:bg-glass transition-colors border-b border-brd`,children:(0,N.jsx)(me,{size:18})}),(0,N.jsx)(`nav`,{className:`flex-1 overflow-y-auto py-4 px-3`,children:u.map(e=>(0,N.jsx)(`div`,{className:`mb-1`,children:e.path?(0,N.jsxs)(ke,{to:e.path,onClick:r,title:m?void 0:i(e.labelKey),className:({isActive:e})=>A(`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,e?`bg-accent/15 text-accent border border-accent/20`:`text-tx2 hover:text-tx1 hover:bg-glass`,!m&&`justify-center px-2`),children:[e.icon,m&&(0,N.jsx)(`span`,{children:i(e.labelKey)})]}):(0,N.jsxs)(N.Fragment,{children:[(0,N.jsxs)(`button`,{onClick:()=>{let t=e.children?.filter(e=>l(e.permission))||[];!m&&t.length?(o(t[0].path),r()):p(e.labelKey)},title:m?void 0:i(e.labelKey),className:A(`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,`text-tx2 hover:text-tx1 hover:bg-glass`,!m&&`justify-center px-2`),children:[e.icon,m&&(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`span`,{className:`flex-1 text-left`,children:i(e.labelKey)}),d[e.labelKey]?(0,N.jsx)(ee,{size:16}):(0,N.jsx)(me,{size:16})]})]}),m&&d[e.labelKey]&&e.children&&(0,N.jsx)(`div`,{className:`ml-4 mt-1 space-y-0.5 animate-fade-in`,children:e.children.filter(e=>l(e.permission)).map(e=>(0,N.jsxs)(ke,{to:e.path,onClick:r,className:({isActive:e})=>A(`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all`,e?`bg-accent/10 text-accent`:`text-tx3 hover:text-tx2 hover:bg-glass`),children:[(0,N.jsx)(`div`,{className:`w-1.5 h-1.5 rounded-full bg-current opacity-50`}),(0,N.jsx)(`span`,{children:i(e.labelKey)})]},e.path))})]})},e.labelKey))}),m&&(0,N.jsxs)(`div`,{className:`px-4 py-3 border-t border-brd space-y-2`,children:[(0,N.jsxs)(`a`,{href:`https://saweria.co/salfanetradius`,target:`_blank`,rel:`noopener noreferrer`,className:`flex items-center gap-2 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors`,children:[(0,N.jsx)(se,{size:13,className:`fill-current`}),(0,N.jsx)(`span`,{children:`Dukung Project — Saweria`})]}),(0,N.jsxs)(`div`,{className:`text-xs text-tx3`,children:[s,` v2.0`]})]})]})]})}var Wt=e(De(),1),Gt={baseUrl:``,reconnect:!0,maxRetries:10,pingInterval:3e4};function Kt(e,t={}){let n={...Gt,...t},[r,i]=(0,j.useState)(null),[a,o]=(0,j.useState)(!1),[s,c]=(0,j.useState)(!1),l=(0,j.useRef)(null),u=(0,j.useRef)(0),d=(0,j.useRef)(null),f=(0,j.useRef)(null),p=(0,j.useRef)(!0),m=(0,j.useRef)(0),h=(0,j.useCallback)(()=>{if(n.baseUrl)return`${n.baseUrl}${e}`;let t=window.location.protocol===`https:`?`wss:`:`ws:`,r=window.location.hostname,i=window.location.port;return i===``||i===`80`||i===`443`?`${t}//${r}${e}`:`${t}//${r}:${window.__WS_PORT__||`8765`}${e}`},[e,n.baseUrl]),g=(0,j.useCallback)(async()=>{try{let e=await fetch(`/api/ws-token`,{credentials:`include`});if(e.ok)return(await e.json()).token||null}catch{}return null},[]),_=(0,j.useCallback)(()=>{d.current&&=(clearInterval(d.current),null),f.current&&=(clearTimeout(f.current),null),l.current&&=(l.current.onclose=null,l.current.close(),null)},[]),v=(0,j.useCallback)(async()=>{if(!p.current)return;let e=l.current;if(e&&e.readyState===WebSocket.CONNECTING)return;_();let t=++m.current,r=await g();if(!p.current||!r||t!==m.current)return;let a=h(),s=`${a}${a.includes(`?`)?`&`:`?`}token=${encodeURIComponent(r)}`,y=new WebSocket(s);l.current=y;let b=setTimeout(()=>{y.readyState===WebSocket.CONNECTING&&y.close()},1e4);y.addEventListener(`open`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`error`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`close`,()=>clearTimeout(b),{once:!0}),y.onopen=()=>{p.current&&(o(!0),c(!1),u.current=0,d.current=setInterval(()=>{y.readyState===WebSocket.OPEN&&y.send(`ping`)},n.pingInterval))},y.onmessage=e=>{if(p.current)try{let t=JSON.parse(e.data);if(t.event===`server_ping`){y.readyState===WebSocket.OPEN&&y.send(`pong`);return}t.event!==`pong`&&i(t)}catch{}},y.onclose=()=>{if(p.current&&(o(!1),d.current&&=(clearInterval(d.current),null),n.reconnect&&u.current<n.maxRetries)){c(!0);let e=Math.min(1e3*2**u.current,3e4);u.current+=1,f.current=setTimeout(()=>{p.current&&v()},e)}},y.onerror=()=>{}},[h,_,g,n.reconnect,n.maxRetries,n.pingInterval]);return(0,j.useEffect)(()=>(p.current=!0,v(),()=>{p.current=!1,_()}),[v,_]),{lastMessage:r,isConnected:a,isReconnecting:s,send:(0,j.useCallback)(e=>{l.current?.readyState===WebSocket.OPEN&&l.current.send(e)},[]),disconnect:(0,j.useCallback)(()=>{p.current=!1,_(),o(!1),c(!1)},[_])}}var qt=(0,j.createContext)(null);function Jt({children:e}){let{lastMessage:t}=Kt(`/ws/dashboard`,{reconnect:!0});return(0,N.jsx)(qt.Provider,{value:t,children:e})}function Yt(){return(0,j.useContext)(qt)}var Xt={critical:{icon:(0,N.jsx)(x,{size:14,className:`text-danger`}),color:`text-danger`},warning:{icon:(0,N.jsx)(x,{size:14,className:`text-warning`}),color:`text-warning`},info:{icon:(0,N.jsx)(S,{size:14,className:`text-info`}),color:`text-info`}},Zt={alarm:{icon:oe,labelKey:`topbar.alarms`,badgeClass:`bg-danger`,iconActiveClass:`text-danger`,headerClass:`text-danger`},unregister:{icon:ue,labelKey:`topbar.unregOnus`,badgeClass:`bg-warning`,iconActiveClass:`text-warning`,headerClass:`text-warning`},general:{icon:_e,labelKey:`topbar.notifications`,badgeClass:`bg-accent`,iconActiveClass:`text-accent`,headerClass:`text-accent`}};function Qt({type:e,notifs:t,unregData:r,onClose:i,onNavigate:a}){let{t:o}=M(),s=Pe(),c=Zt[e].icon,l=Ge({mutationFn:async e=>fetch(`/api/notifications/${e}/read`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),u=Ge({mutationFn:async()=>fetch(`/api/notifications/read-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),f=Ge({mutationFn:async e=>fetch(`/api/notifications/${e}/acknowledge`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),p=Ge({mutationFn:async()=>fetch(`/api/notifications/acknowledge-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),m=Ge({mutationFn:async()=>fetch(`/api/notifications/clear`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),h=t.filter(e=>!e.is_read&&!e.resolved).length,_=t.filter(e=>!e.resolved),v=t.filter(e=>e.resolved),y={offline:`offline`,offline_batch:`offline`,dyinggasp:`dyinggasp`,dyinggasp_batch:`dyinggasp`,los:`los`,los_batch:`los`,signal:`los`,signal_drop:`los`,signal_drop_batch:`los`},b=t=>{if(t.is_read||l.mutate(t.id),e===`alarm`){let e=y[t.category];e&&(i(),a(`/dashboard/onus?filter=${e}`))}else e===`unregister`&&(i(),a(`/dashboard/onus/register`))};return(0,N.jsxs)(`div`,{className:`fixed md:absolute left-2 right-2 md:left-auto md:right-0 top-14 md:top-12 w-auto md:w-96 max-h-[80vh] md:max-h-[75vh] rounded-2xl z-50 animate-fade-in overflow-hidden flex flex-col shadow-2xl shadow-black/40 border border-brd`,style:{background:`var(--bg-surface)`,backdropFilter:`blur(20px)`},children:[(0,N.jsxs)(`div`,{className:`flex items-center justify-between px-4 py-3 border-b border-brd`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,N.jsx)(c,{size:16,className:Zt[e].headerClass}),(0,N.jsx)(`span`,{className:`font-semibold text-sm`,children:o(Zt[e].labelKey)}),h>0&&(0,N.jsx)(`span`,{className:A(`px-2 py-0.5 rounded-full text-[10px] font-bold text-white`,Zt[e].badgeClass),children:h})]}),(0,N.jsxs)(`div`,{className:`flex gap-1`,children:[h>0&&(0,N.jsx)(`button`,{onClick:()=>p.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-success transition-colors`,title:o(`topbar.ackAll`),children:(0,N.jsx)(le,{size:14})}),h>0&&(0,N.jsx)(`button`,{onClick:()=>u.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors`,title:o(`topbar.markAllRead`),children:(0,N.jsx)(S,{size:14})}),(0,N.jsx)(`button`,{onClick:()=>m.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-danger transition-colors`,title:o(`topbar.clearRead`),children:(0,N.jsx)(w,{size:14})}),(0,N.jsx)(`button`,{onClick:i,className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1 transition-colors`,title:o(`common.close`),children:(0,N.jsx)(T,{size:14})})]})]}),e===`unregister`&&r&&r.unregistered>0&&(0,N.jsxs)(`div`,{onClick:()=>{i(),a(`/dashboard/onus/register`)},className:`px-4 py-3 bg-warning/10 border-b border-warning/20 cursor-pointer hover:bg-warning/15 transition-colors group`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,N.jsx)(`div`,{className:`w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0`,children:(0,N.jsx)(ue,{size:16,className:`text-warning`})}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,N.jsx)(`div`,{className:`text-sm font-medium text-warning`,children:o(`topbar.unregCta`,{count:r.unregistered})}),(0,N.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5`,children:o(`topbar.tapToRegister`)})]}),(0,N.jsx)(d,{size:16,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]}),r.breakdown.slice(0,3).map((e,t)=>(0,N.jsxs)(`div`,{className:`text-xs text-tx3 mt-1.5 pl-10`,children:[e.olt_name,`: `,e.count,` ONU(s)`]},t))]}),e===`alarm`&&r&&r.offline_dyinggasp>0&&(0,N.jsxs)(`div`,{className:`border-b border-brd/50`,children:[r.dyinggasp_count>0&&(0,N.jsx)(`div`,{onClick:()=>{i(),a(`/dashboard/onus?filter=dyinggasp`)},className:`px-4 py-2.5 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors group`,children:(0,N.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,N.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0`,children:(0,N.jsx)(x,{size:14,className:`text-warning`})}),(0,N.jsx)(`div`,{className:`flex-1`,children:(0,N.jsx)(`span`,{className:`text-xs font-medium text-warning`,children:o(`topbar.onuDyinggasp`,{count:r.dyinggasp_count})})}),(0,N.jsx)(d,{size:14,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]})}),r.offline_count>0&&(0,N.jsx)(`div`,{onClick:()=>{i(),a(`/dashboard/onus?filter=offline`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,N.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,N.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,N.jsx)(g,{size:14,className:`text-danger`})}),(0,N.jsx)(`div`,{className:`flex-1`,children:(0,N.jsx)(`span`,{className:`text-xs font-medium text-danger`,children:o(`topbar.onuOffline`,{count:r.offline_count})})}),(0,N.jsx)(d,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})}),r.los_count>0&&(0,N.jsx)(`div`,{onClick:()=>{i(),a(`/dashboard/onus?filter=los`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,N.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,N.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,N.jsx)(n,{size:14,className:`text-danger`})}),(0,N.jsx)(`div`,{className:`flex-1`,children:(0,N.jsx)(`span`,{className:`text-xs font-medium text-danger`,children:o(`topbar.onuLos`,{count:r.los_count})})}),(0,N.jsx)(d,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})})]}),(0,N.jsx)(`div`,{className:`overflow-y-auto flex-1 max-h-[55vh] md:max-h-[50vh] overscroll-contain`,children:_.length===0&&v.length===0?(0,N.jsxs)(`div`,{className:`py-10 text-center`,children:[(0,N.jsx)(c,{size:28,className:`text-tx3/40 mx-auto mb-2`}),(0,N.jsx)(`p`,{className:`text-tx3 text-sm`,children:o(e===`alarm`?`topbar.noAlarms`:e===`unregister`?`topbar.noUnreg`:`topbar.noNotif`)})]}):(0,N.jsxs)(N.Fragment,{children:[_.map(e=>{let t=Xt[e.severity||`info`]||Xt.info,n=e.acknowledged;return(0,N.jsx)(`div`,{onClick:()=>b(e),className:A(`px-4 py-3 border-b border-brd/50 cursor-pointer hover:bg-glass/50 transition-colors group`,!e.is_read&&`bg-accent/5`,n&&`opacity-60`),children:(0,N.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,N.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:t.icon}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,N.jsx)(`span`,{className:`text-sm font-medium truncate`,children:e.title}),n&&(0,N.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,N.jsx)(le,{size:9}),` ACK`]})]}),(0,N.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-2`,children:e.message.split(`
`)[0]}),(0,N.jsxs)(`div`,{className:`text-[10px] text-tx3/70 mt-1 flex items-center gap-2`,children:[(0,N.jsx)(`span`,{children:e.created_at?new Date(e.created_at).toLocaleString():``}),n&&e.acknowledged_by&&(0,N.jsxs)(`span`,{className:`text-success/70`,children:[`by `,e.acknowledged_by]})]})]}),(0,N.jsxs)(`div`,{className:`flex flex-col items-center gap-1 flex-shrink-0`,children:[!e.is_read&&(0,N.jsx)(`div`,{className:`w-2 h-2 rounded-full bg-accent animate-pulse`}),!n&&(0,N.jsx)(`button`,{onClick:t=>{t.stopPropagation(),f.mutate(e.id)},className:`p-1 rounded hover:bg-success/15 text-tx3 hover:text-success transition-colors opacity-0 group-hover:opacity-100`,title:o(`topbar.acknowledge`),children:(0,N.jsx)(le,{size:14})})]})]})},e.id)}),v.length>0&&(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{className:`px-4 py-1.5 bg-glass/30 border-b border-brd/50 text-[10px] font-medium text-tx3 uppercase tracking-wide`,children:o(`topbar.resolved`,{count:v.length})}),v.map(e=>(0,N.jsx)(`div`,{onClick:()=>b(e),className:`px-4 py-2.5 border-b border-brd/50 cursor-pointer hover:bg-glass/30 transition-colors opacity-50`,children:(0,N.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,N.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:(0,N.jsx)(le,{size:14,className:`text-success`})}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,N.jsx)(`span`,{className:`text-sm font-medium truncate line-through`,children:e.title}),(0,N.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,N.jsx)(le,{size:9}),` RESOLVED`]})]}),(0,N.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-1`,children:e.message.split(`
`)[0]}),(0,N.jsx)(`div`,{className:`text-[10px] text-tx3/70 mt-1`,children:e.resolved_at?o(`topbar.resolvedAt`,{time:new Date(e.resolved_at).toLocaleString()}):``})]})]})},e.id))]})]})})]})}function $t({onMenuClick:e}){let{t}=M(),{user:n,logout:r}=F(),{resolved:i,toggle:a}=zt(),[o,s]=(0,j.useState)(!1),[c,l]=(0,j.useState)(null),u=Pe(),d=Ee(),f=(0,j.useRef)(null),p=(0,j.useRef)(null),m=(0,j.useRef)(null),{data:h}=Ve({queryKey:[`notifications`],queryFn:async()=>{let e=await fetch(`/api/notifications?limit=50`,{credentials:`include`});return e.ok?e.json():{notifications:[],unread_count:0,alarm_unread:0,unregister_unread:0,general_unread:0}},refetchInterval:1e4}),g=Yt();(0,j.useEffect)(()=>{g&&(g.event===`alert`||g.event===`onu_change`)&&(u.invalidateQueries({queryKey:[`notifications`]}),u.invalidateQueries({queryKey:[`unregistered-count`]}))},[g,u]);let{data:_}=Ve({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),y=h?.notifications||[],x=h?.alarm_unread||0,ee=h?.unregister_unread||0,S=h?.general_unread||0,ne=ee+(_?.unregistered||0),re=(0,j.useMemo)(()=>y.filter(e=>e.type===`alarm`),[y]),ie=(0,j.useMemo)(()=>y.filter(e=>e.type===`unregister`),[y]),ae=(0,j.useMemo)(()=>y.filter(e=>e.type===`general`),[y]);(0,j.useEffect)(()=>{let e=e=>{f.current&&!f.current.contains(e.target)&&l(null),p.current&&!p.current.contains(e.target)&&!m.current?.contains(e.target)&&s(!1)};return document.addEventListener(`mousedown`,e),()=>document.removeEventListener(`mousedown`,e)},[]);let oe=e=>{d(e)},C=(e,n,r)=>{let i=Zt[e],a=i.icon,o=c===e;return(0,N.jsxs)(`button`,{onClick:()=>l(o?null:e),className:A(`relative p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,o&&`bg-glass`,r),title:t(i.labelKey),"aria-label":t(i.labelKey),children:[(0,N.jsx)(a,{size:18,className:A(`text-tx2 transition-colors`,o&&i.iconActiveClass)}),n>0&&(0,N.jsx)(`div`,{className:A(`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse-once`,i.badgeClass),children:n>99?`99+`:n})]},e)};return(0,N.jsxs)(`header`,{className:`sticky top-0 z-30 h-14 md:h-16 flex items-center justify-between px-3 md:px-6 bg-surface/80 backdrop-blur-xl border-b border-brd transition-colors duration-300`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,N.jsx)(`button`,{onClick:e,className:`p-2 rounded-lg hover:bg-glass transition-colors lg:hidden active:scale-95`,children:(0,N.jsx)(b,{size:20,className:`text-tx2`})}),(0,N.jsxs)(`div`,{className:`flex items-center gap-1.5 lg:hidden`,children:[(0,N.jsx)(`div`,{className:A(`w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-accent/20 overflow-hidden`,n?.logo_url?`bg-white p-1`:`bg-accent`),children:n?.logo_url?(0,N.jsx)(`img`,{src:n.logo_url,alt:``,className:`w-full h-full object-contain`}):(0,N.jsx)(he,{size:15,className:`text-white`})}),(0,N.jsx)(`span`,{className:`text-sm font-bold tracking-tight`,children:n?.sidebar_name||`Salfanet NMS`})]})]}),(0,N.jsxs)(`div`,{className:`flex items-center gap-1`,children:[(0,N.jsx)(`button`,{onClick:a,className:`hidden sm:inline-flex p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,title:t(i===`light`?`topbar.themeToDark`:`topbar.themeToLight`),children:i===`light`?(0,N.jsx)(fe,{size:18,className:`text-tx2`}):(0,N.jsx)(v,{size:18,className:`text-tx2`})}),(0,N.jsxs)(`div`,{className:`relative flex items-center gap-0.5`,ref:f,children:[C(`alarm`,x),C(`unregister`,ne),C(`general`,S,`hidden sm:block`),c===`alarm`&&(0,N.jsx)(Qt,{type:`alarm`,notifs:re,unregData:_,onClose:()=>l(null),onNavigate:oe}),c===`unregister`&&(0,N.jsx)(Qt,{type:`unregister`,notifs:ie,unregData:_,onClose:()=>l(null),onNavigate:oe}),c===`general`&&(0,N.jsx)(Qt,{type:`general`,notifs:ae,unregData:_,onClose:()=>l(null),onNavigate:oe})]}),(0,N.jsxs)(`div`,{className:`relative`,ref:p,children:[(0,N.jsxs)(`button`,{onClick:()=>s(!o),className:`flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-glass transition-colors active:scale-95`,children:[(0,N.jsx)(`div`,{className:`w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center ring-1 ring-accent/20`,children:(0,N.jsx)(pe,{size:16,className:`text-accent`})}),(0,N.jsxs)(`div`,{className:`text-left hidden sm:block`,children:[(0,N.jsx)(`div`,{className:`text-sm font-medium leading-tight`,children:n?.full_name||`Admin`}),(0,N.jsx)(`div`,{className:`text-[10px] text-tx3 leading-tight`,children:n?.is_super_admin&&(!n?.role||n.role===`User`)?t(`topbar.superAdmin`):n?.role||`User`})]})]}),o&&(0,Wt.createPortal)((0,N.jsxs)(`div`,{ref:m,style:{position:`fixed`},className:`top-14 right-2 w-52 max-w-[calc(100vw-1rem)] py-1.5 glass-card rounded-xl z-[999] animate-fade-in shadow-2xl shadow-black/20`,children:[(0,N.jsxs)(`div`,{className:`px-4 py-2.5 border-b border-brd`,children:[(0,N.jsx)(`div`,{className:`text-sm font-medium`,children:n?.full_name||`Admin`}),(0,N.jsx)(`div`,{className:`text-xs text-tx3`,children:n?.username||``}),n?.is_super_admin&&(0,N.jsx)(`div`,{className:`text-[10px] text-accent font-medium mt-0.5`,children:t(`topbar.superAdmin`)})]}),(0,N.jsxs)(`button`,{onClick:()=>{s(!1),d(`/dashboard/profile`)},className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,N.jsx)(pe,{size:16,className:`text-tx3`}),` `,t(`topbar.myProfile`)]}),(0,N.jsxs)(`button`,{onClick:()=>{s(!1),l(`general`)},className:`sm:hidden flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,N.jsx)(_e,{size:16,className:`text-tx3`}),(0,N.jsx)(`span`,{className:`flex-1 text-left`,children:t(`topbar.notifications`)}),S>0&&(0,N.jsx)(`span`,{className:`px-1.5 min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center`,children:S>99?`99+`:S})]}),(0,N.jsxs)(`button`,{onClick:()=>{a()},className:`sm:hidden flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[i===`light`?(0,N.jsx)(fe,{size:16,className:`text-tx3`}):(0,N.jsx)(v,{size:16,className:`text-tx3`}),t(i===`light`?`topbar.themeToDark`:`topbar.themeToLight`)]}),(0,N.jsx)(`hr`,{className:`border-brd my-1`}),(0,N.jsxs)(`button`,{onClick:()=>r(),className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors`,children:[(0,N.jsx)(te,{size:16}),` `,t(`topbar.logout`)]})]}),document.body)]})]})]})}function en(){let{t:e}=M(),[t,n]=(0,j.useState)(navigator.onLine);return(0,j.useEffect)(()=>{let e=()=>n(!0),t=()=>n(!1);return window.addEventListener(`online`,e),window.addEventListener(`offline`,t),()=>{window.removeEventListener(`online`,e),window.removeEventListener(`offline`,t)}},[]),t?null:(0,N.jsxs)(`div`,{className:`fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black text-xs font-medium text-center py-1 flex items-center justify-center gap-1.5`,children:[(0,N.jsx)(g,{size:13}),(0,N.jsx)(`span`,{children:e(`cmp_off.connectionLostDataCan`)})]})}var tn={sm:`max-w-md`,md:`max-w-lg`,lg:`max-w-2xl`,xl:`max-w-4xl`};function nn({open:e,onClose:t,title:n,icon:r,children:i,size:a=`md`,footer:o}){return(0,j.useEffect)(()=>{if(!e)return;let n=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,n),()=>document.removeEventListener(`keydown`,n)},[e,t]),e?(0,Wt.createPortal)((0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{className:`modal-overlay`,onClick:t}),(0,N.jsx)(`div`,{className:`modal-wrapper`,children:(0,N.jsxs)(`div`,{className:A(`relative glass-card w-full flex flex-col rounded-t-2xl md:rounded-2xl`,`max-h-[90dvh] md:max-h-[85dvh] animate-slide-up md:animate-fade-in`,tn[a]),onClick:e=>e.stopPropagation(),children:[n&&(0,N.jsxs)(`div`,{className:`section-header sticky top-0 z-10 rounded-t-2xl`,children:[(0,N.jsxs)(`h2`,{className:`section-title`,children:[r,n]}),(0,N.jsx)(`button`,{onClick:t,className:`text-tx3 hover:text-tx1 transition-colors p-1 rounded-lg hover:bg-glass`,children:(0,N.jsx)(T,{size:18})})]}),(0,N.jsx)(`div`,{className:`overflow-y-auto flex-1 p-4 md:p-5`,children:i}),o&&(0,N.jsx)(`div`,{className:`modal-footer justify-end`,children:o})]})})]}),document.body):null}function rn({title:e,icon:t,action:n,children:r,className:i,bodyClassName:a,onClick:o}){return(0,N.jsxs)(`div`,{className:A(`glass-card`,i),onClick:o,role:o?`button`:void 0,tabIndex:o?0:void 0,onKeyDown:o?e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),o())}:void 0,children:[e&&(0,N.jsxs)(`div`,{className:`section-header`,children:[(0,N.jsxs)(`h3`,{className:`section-title`,children:[t,e]}),n]}),(0,N.jsx)(`div`,{className:A(`p-4 md:p-5`,a),children:r})]})}function an({size:e=`md`,className:t}){return(0,N.jsx)(`div`,{className:A(`spinner`,e===`lg`&&`spinner-lg`,e===`sm`&&`spinner-sm`,t)})}function on({label:e}){return(0,N.jsxs)(`div`,{className:`flex flex-col items-center justify-center py-12`,children:[(0,N.jsx)(re,{size:28,className:`text-accent animate-spin`}),e&&(0,N.jsx)(`p`,{className:`text-tx3 text-sm mt-3`,children:e})]})}function sn({icon:e,title:t,description:n,action:r}){return(0,N.jsxs)(`div`,{className:`empty-state`,children:[e&&(0,N.jsx)(`div`,{className:`empty-state-icon`,children:(0,N.jsx)(e,{size:22})}),(0,N.jsx)(`p`,{className:`empty-state-title`,children:t}),n&&(0,N.jsx)(`p`,{className:`empty-state-desc`,children:n}),r&&(0,N.jsx)(`div`,{className:`mt-4`,children:r})]})}function cn({children:e,className:t,maxHeight:n=`max-h-64`}){return(0,N.jsx)(`div`,{className:A(`code-block`,n,`overflow-y-auto`,t),children:(0,N.jsx)(`pre`,{children:e})})}function ln({tabs:e,active:t,onChange:n,className:r}){return(0,N.jsx)(`div`,{className:A(`flex gap-1 p-1 rounded-lg bg-glass border border-brd w-full sm:w-fit max-w-full overflow-x-auto tab-scroll`,r),children:e.map(e=>(0,N.jsxs)(`button`,{type:`button`,onClick:()=>n(e.key),className:A(`tab-btn inline-flex items-center gap-1.5 flex-shrink-0`,t===e.key&&`tab-btn-active`),children:[e.icon,e.label]},e.key))})}function un({className:e}){return(0,N.jsx)(`div`,{className:A(`animate-pulse rounded-lg bg-glass`,e)})}var dn={primary:`btn-primary`,secondary:`btn-cancel border border-brd`,ghost:`btn-ghost`,danger:`btn-danger`,warning:`btn-warning`,accent:`btn-accent`,icon:`p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass transition-colors active:scale-95`},fn=(0,j.forwardRef)(function({variant:e=`primary`,loading:t=!1,icon:n,disabled:r,className:i,children:a,type:o=`button`,...s},c){return(0,N.jsxs)(`button`,{ref:c,type:o,disabled:r||t,"aria-busy":t||void 0,className:A(dn[e],`inline-flex items-center justify-center gap-2`,i),...s,children:[t?(0,N.jsx)(an,{size:`sm`}):n,a]})}),pn=(0,j.forwardRef)(function({label:e,error:t,helperText:n,icon:r,suffix:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,j.useId)(),d=s||u;return(0,N.jsxs)(`div`,{className:A(`w-full`,o),children:[e&&(0,N.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,N.jsxs)(`div`,{className:`relative`,children:[r&&(0,N.jsx)(`span`,{className:`absolute left-3 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none`,children:r}),(0,N.jsx)(`input`,{ref:l,id:d,className:A(`input-field`,r&&`pl-9`,i&&`pr-10`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c}),i&&(0,N.jsx)(`span`,{className:`absolute right-3 top-1/2 -translate-y-1/2 text-tx3`,children:i})]}),t?(0,N.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,N.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),mn=(0,j.forwardRef)(function({label:e,error:t,helperText:n,options:r,children:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,j.useId)(),d=s||u;return(0,N.jsxs)(`div`,{className:A(`w-full`,o),children:[e&&(0,N.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,N.jsx)(`select`,{ref:l,id:d,className:A(`input-field`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c,children:r?r.map(e=>(0,N.jsx)(`option`,{value:e.value,disabled:e.disabled,children:e.label},e.value)):i}),t?(0,N.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,N.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})});(0,j.forwardRef)(function({label:e,error:t,helperText:n,className:r,wrapperClassName:i,id:a,...o},s){let c=(0,j.useId)(),l=a||c;return(0,N.jsxs)(`div`,{className:A(`w-full`,i),children:[e&&(0,N.jsx)(`label`,{htmlFor:l,className:`label-sm block`,children:e}),(0,N.jsx)(`textarea`,{ref:s,id:l,className:A(`input-field`,`h-auto min-h-[80px] py-2.5`,t&&`border-danger`,r),"aria-invalid":!!t||void 0,"aria-describedby":t?`${l}-error`:n?`${l}-helper`:void 0,...o}),t?(0,N.jsx)(`p`,{id:`${l}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,N.jsx)(`p`,{id:`${l}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})});var hn={ok:`var(--status-ok)`,warn:`var(--status-warn)`,crit:`var(--status-crit)`,idle:`var(--status-idle)`,info:`var(--status-info)`};function gn({items:e,active:t,onSelect:n,className:r,...i}){return(0,N.jsx)(`div`,{role:n?`toolbar`:`list`,"aria-label":i[`aria-label`],className:A(`scroll-row md:flex-wrap md:overflow-visible -mx-3 px-3 md:mx-0 md:px-0`,r),children:e.map(e=>{let r=e.color||hn[e.tone||`idle`],i=t===e.key,a=(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`span`,{className:`status-dot`,"aria-hidden":`true`}),e.icon&&(0,N.jsx)(`span`,{className:`opacity-80`,"aria-hidden":`true`,children:e.icon}),(0,N.jsx)(`span`,{children:e.label}),(0,N.jsx)(`span`,{className:`status-chip-count`,children:e.count})]}),o={"--chip-tone":r};return n?(0,N.jsx)(`button`,{type:`button`,className:`status-chip`,"data-active":i,"aria-pressed":i,title:e.title,style:o,onClick:()=>n(e.key),children:a},e.key):(0,N.jsx)(`span`,{role:`listitem`,className:`status-chip`,"data-active":i,title:e.title,style:o,children:a},e.key)})})}function _n({open:e,onClose:t,title:n,description:r,children:i,footer:a,width:o=420,className:s}){let{t:c}=M(),l=(0,j.useRef)(null);return(0,j.useEffect)(()=>{if(!e)return;let n=document.activeElement,r=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,r),l.current?.focus(),()=>{document.removeEventListener(`keydown`,r),n?.focus?.()}},[e,t]),e?(0,Wt.createPortal)((0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{className:`sheet-backdrop`,onClick:t,"aria-hidden":`true`}),(0,N.jsxs)(`div`,{ref:l,role:`dialog`,"aria-modal":`true`,"aria-label":typeof n==`string`?n:void 0,tabIndex:-1,className:A(`sheet-panel outline-none`,s),style:{"--sheet-w":`${o}px`},children:[(0,N.jsx)(`div`,{className:`sheet-grip`,"aria-hidden":`true`}),(n||r)&&(0,N.jsxs)(`div`,{className:`flex items-start justify-between gap-3 px-4 pt-3 pb-3 md:px-5 md:pt-5 border-b border-brd`,children:[(0,N.jsxs)(`div`,{className:`min-w-0`,children:[n&&(0,N.jsx)(`h2`,{className:`text-base font-semibold text-tx1 truncate`,children:n}),r&&(0,N.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:r})]}),(0,N.jsx)(`button`,{type:`button`,onClick:t,className:`touch-target -mr-2 -mt-1 p-2 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass flex items-center justify-center`,"aria-label":c(`common.close`),children:(0,N.jsx)(T,{size:18})})]}),(0,N.jsx)(`div`,{className:`flex-1 overflow-y-auto overscroll-contain p-4 md:p-5`,children:i}),a&&(0,N.jsx)(`div`,{className:`border-t border-brd p-3 md:p-4 flex gap-2 justify-end`,children:a})]})]}),document.body):null}function vn(e){let[t,n]=(0,j.useState)(()=>typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(e).matches);return(0,j.useEffect)(()=>{if(typeof window.matchMedia!=`function`)return;let t=window.matchMedia(e),r=()=>n(t.matches);return r(),t.addEventListener?.(`change`,r),()=>t.removeEventListener?.(`change`,r)},[e]),t}var yn=()=>!vn(`(min-width: 768px)`);function bn({actions:e,label:t,title:n,iconOnly:r,className:a}){let{t:o}=M(),s=yn(),[c,l]=(0,j.useState)(!1),u=(0,j.useRef)(null),d=(0,j.useRef)(null),[f,p]=(0,j.useState)(null),m=t||o(`ui.more`),h=e.filter(e=>!e.danger),g=e.filter(e=>e.danger);(0,j.useLayoutEffect)(()=>{if(!c||s||!u.current)return;let e=u.current.getBoundingClientRect();p({top:e.bottom+6,right:Math.max(8,window.innerWidth-e.right)})},[c,s]),(0,j.useEffect)(()=>{if(!c||s)return;let e=e=>{let t=e.target;!d.current?.contains(t)&&!u.current?.contains(t)&&l(!1)},t=e=>{e.key===`Escape`&&l(!1)},n=()=>l(!1);return document.addEventListener(`mousedown`,e),document.addEventListener(`keydown`,t),window.addEventListener(`scroll`,n,!0),window.addEventListener(`resize`,n),()=>{document.removeEventListener(`mousedown`,e),document.removeEventListener(`keydown`,t),window.removeEventListener(`scroll`,n,!0),window.removeEventListener(`resize`,n)}},[c,s]);let _=e=>{e.disabled||(l(!1),e.onClick())},v=(e,t)=>(0,N.jsxs)(`button`,{type:`button`,role:`menuitem`,disabled:e.disabled,onClick:()=>_(e),className:A(`w-full flex items-center gap-3 text-left rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed`,t?`min-h-[48px] px-3 text-[15px]`:`px-3 py-2 text-sm`,e.danger?`text-danger hover:bg-danger/10`:`text-tx1 hover:bg-glass`),children:[e.icon&&(0,N.jsx)(`span`,{className:A(`shrink-0`,e.danger?`text-danger`:`text-tx3`),"aria-hidden":`true`,children:e.icon}),(0,N.jsxs)(`span`,{className:`flex-1 min-w-0`,children:[(0,N.jsx)(`span`,{className:`block truncate`,children:e.label}),e.hint&&(0,N.jsx)(`span`,{className:`block text-xs text-tx3 truncate`,children:e.hint})]})]},e.key),y=e=>(0,N.jsxs)(`div`,{role:`menu`,className:`flex flex-col gap-0.5`,children:[h.map(t=>v(t,e)),g.length>0&&(0,N.jsxs)(N.Fragment,{children:[h.length>0&&(0,N.jsx)(`hr`,{className:`border-brd my-1.5`}),g.map(t=>v(t,e))]})]});return e.length===0?null:(0,N.jsxs)(N.Fragment,{children:[(0,N.jsxs)(`button`,{ref:u,type:`button`,onClick:()=>l(e=>!e),"aria-haspopup":`menu`,"aria-expanded":c,"aria-label":r?m:void 0,title:r?m:void 0,className:A(r?`touch-target p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass inline-flex items-center justify-center`:`btn-cancel border border-brd inline-flex items-center justify-center gap-2`,a),children:[(0,N.jsx)(i,{size:18,"aria-hidden":`true`}),!r&&(0,N.jsx)(`span`,{children:m})]}),c&&s&&(0,N.jsx)(_n,{open:!0,onClose:()=>l(!1),title:n||m,children:y(!0)}),c&&!s&&f&&(0,Wt.createPortal)((0,N.jsxs)(`div`,{ref:d,style:{position:`fixed`,top:f.top,right:f.right},className:`z-[70] w-60 max-h-[70vh] overflow-y-auto p-1.5 rounded-xl border border-brd shadow-2xl shadow-black/30 animate-fade-in`,children:[(0,N.jsx)(`div`,{className:`absolute inset-0 -z-10 rounded-xl`,style:{background:`var(--bg-surface)`}}),y(!1)]}),document.body)]})}function xn({steps:e,current:t,onStepClick:n,className:r}){let{t:i}=M(),a=e.length,o=Math.min(Math.max(t,0),a-1),s=a>1?(o+1)/a*100:100;return(0,N.jsxs)(`nav`,{"aria-label":i(`ui.steps`),className:r,children:[(0,N.jsxs)(`div`,{className:`md:hidden`,children:[(0,N.jsxs)(`div`,{className:`flex items-baseline justify-between gap-2 text-sm`,children:[(0,N.jsx)(`span`,{className:`font-semibold text-tx1 truncate`,children:e[o]?.label}),(0,N.jsx)(`span`,{className:`text-xs text-tx3 num shrink-0`,children:i(`ui.stepOf`,{n:o+1,total:a})})]}),(0,N.jsx)(`div`,{className:`mt-2 h-1.5 rounded-full bg-glass overflow-hidden`,role:`progressbar`,"aria-valuemin":1,"aria-valuemax":a,"aria-valuenow":o+1,children:(0,N.jsx)(`div`,{className:`h-full rounded-full bg-accent transition-[width] duration-300`,style:{width:`${s}%`}})})]}),(0,N.jsx)(`ol`,{className:`hidden md:flex items-center gap-2`,children:e.map((e,t)=>{let r=t<o,i=t===o,s=r&&!!n;return(0,N.jsxs)(`li`,{className:`flex items-center gap-2 min-w-0 flex-1 last:flex-none`,children:[(0,N.jsxs)(`button`,{type:`button`,disabled:!s,onClick:()=>s&&n?.(t),"aria-current":i?`step`:void 0,className:A(`flex items-center gap-2 min-w-0 rounded-lg px-1 py-1`,s&&`hover:bg-glass`),children:[(0,N.jsx)(`span`,{className:A(`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold num border`,r&&`bg-accent text-white border-accent`,i&&`border-accent text-accent bg-accent/10`,!r&&!i&&`border-brd text-tx3`),children:r?(0,N.jsx)(S,{size:14}):t+1}),(0,N.jsx)(`span`,{className:A(`text-sm truncate`,i?`text-tx1 font-semibold`:`text-tx3`),children:e.label})]}),t<a-1&&(0,N.jsx)(`span`,{className:A(`h-px flex-1 min-w-4`,r?`bg-accent`:`bg-brd`),"aria-hidden":`true`})]},t)})})]})}var Sn={info:{icon:(0,N.jsx)(r,{size:18}),cls:`border-accent/30 bg-accent/10 text-accent`},ok:{icon:(0,N.jsx)(le,{size:18}),cls:`border-success/30 bg-success/10 text-success`},warn:{icon:(0,N.jsx)(x,{size:18}),cls:`border-warning/30 bg-warning/10 text-warning`},crit:{icon:(0,N.jsx)(n,{size:18}),cls:`border-danger/30 bg-danger/10 text-danger`}},Cn=e=>{try{return localStorage.getItem(`nms-notice:${e}`)===`1`}catch{return!1}},wn=e=>{try{localStorage.setItem(`nms-notice:${e}`,`1`)}catch{}};function Tn({tone:e=`info`,title:t,children:n,action:r,dismissKey:i,className:a}){let{t:o}=M(),[s,c]=(0,j.useState)(()=>i?Cn(i):!1);if(s)return null;let l=Sn[e];return(0,N.jsxs)(`div`,{role:e===`crit`||e===`warn`?`alert`:`status`,className:A(`flex items-start gap-3 rounded-xl border px-4 py-3`,l.cls,a),children:[(0,N.jsx)(`span`,{className:`shrink-0 mt-0.5`,"aria-hidden":`true`,children:l.icon}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0 text-sm`,children:[t&&(0,N.jsx)(`p`,{className:`font-medium text-tx1`,children:t}),n&&(0,N.jsx)(`div`,{className:A(`text-tx2`,t&&`mt-0.5`),children:n}),r&&(0,N.jsx)(`div`,{className:`mt-2 flex flex-wrap gap-2`,children:r})]}),i&&(0,N.jsx)(`button`,{type:`button`,onClick:()=>{wn(i),c(!0)},className:`shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass`,"aria-label":o(`common.close`),children:(0,N.jsx)(T,{size:16})})]})}function En({children:e,className:t}){return(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{className:`sticky-action-spacer`,"aria-hidden":`true`}),(0,N.jsx)(`div`,{className:A(`sticky-action-bar`,t),children:e})]})}function Dn(){let{t:e}=M(),{user:t,fetchUser:n,logout:r}=F(),[i,o]=(0,j.useState)(``),[s,c]=(0,j.useState)(``),[l,u]=(0,j.useState)(``),[d,f]=(0,j.useState)(!1),[p,m]=(0,j.useState)(!1),[g,_]=(0,j.useState)(``);if(!t?.must_change_password)return null;let v=async t=>{if(t.preventDefault(),_(``),s!==l){_(e(`profile.passwordMismatch`));return}m(!0);try{if(!(await et.updateProfile({password:s,current_password:i})).success)throw Error(e(`error.generic`));P.success(e(`profile.updated`)),o(``),c(``),u(``),await n()}catch(t){let n=t instanceof tt?t.errorCode:void 0;_(n?e(`error.${n}`,{defaultValue:t.message}):t.message)}finally{m(!1)}},y=(0,N.jsx)(`button`,{type:`button`,onClick:()=>f(e=>!e),tabIndex:-1,"aria-label":`toggle password visibility`,children:d?(0,N.jsx)(a,{size:16}):(0,N.jsx)(h,{size:16})}),b=d?`text`:`password`;return(0,Wt.createPortal)((0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{className:`modal-overlay`,style:{zIndex:60}}),(0,N.jsx)(`div`,{className:`modal-wrapper`,style:{zIndex:61},role:`dialog`,"aria-modal":`true`,"aria-labelledby":`force-pw-title`,children:(0,N.jsxs)(`form`,{onSubmit:v,className:`relative glass-card w-full max-w-md p-5 md:p-6 rounded-t-2xl md:rounded-2xl animate-fade-in`,children:[(0,N.jsxs)(`div`,{className:`flex items-start gap-3 mb-4`,children:[(0,N.jsx)(`div`,{className:`icon-badge w-10 h-10`,"data-color":`warning`,children:(0,N.jsx)(oe,{size:20})}),(0,N.jsxs)(`div`,{children:[(0,N.jsx)(`h2`,{id:`force-pw-title`,className:`section-title`,children:e(`profile.mustChangeTitle`)}),(0,N.jsx)(`p`,{className:`text-sm text-tx3 mt-1`,children:e(`profile.forceMsg`)})]})]}),(0,N.jsxs)(`div`,{className:`space-y-3`,children:[(0,N.jsx)(pn,{label:e(`profile.currentPassword`),type:b,value:i,autoComplete:`current-password`,onChange:e=>o(e.target.value),suffix:y,autoFocus:!0,required:!0}),(0,N.jsx)(pn,{label:e(`profile.newPassword`),type:b,value:s,autoComplete:`new-password`,onChange:e=>c(e.target.value),helperText:e(`profile.forceHint`),required:!0}),(0,N.jsx)(pn,{label:e(`profile.confirmPassword`),type:b,value:l,autoComplete:`new-password`,onChange:e=>u(e.target.value),required:!0})]}),g&&(0,N.jsx)(`p`,{role:`alert`,className:`text-sm text-danger mt-3`,children:g}),(0,N.jsxs)(`div`,{className:`flex items-center justify-between gap-2 mt-5`,children:[(0,N.jsx)(fn,{variant:`ghost`,icon:(0,N.jsx)(te,{size:14}),onClick:()=>r(),children:e(`topbar.logout`)}),(0,N.jsx)(fn,{type:`submit`,loading:p,disabled:!i||!s||!l,children:e(`profile.saveChanges`)})]})]})})]}),document.body)}function On(e){let t=`=`.repeat((4-e.length%4)%4),n=atob((e+t).replace(/-/g,`+`).replace(/_/g,`/`));return Uint8Array.from(n,e=>e.charCodeAt(0))}function kn(){return`serviceWorker`in navigator&&`PushManager`in window&&`Notification`in window}async function An(){if(!kn())return`unsupported`;if(Notification.permission===`denied`)return`denied`;try{return await(await navigator.serviceWorker.ready).pushManager.getSubscription()?`subscribed`:`unsubscribed`}catch{return`unsubscribed`}}async function jn(){if(!kn()||(Notification.permission===`granted`?`granted`:await Notification.requestPermission())!==`granted`)return!1;let e=await navigator.serviceWorker.ready,{public_key:t}=await et.pushVapidKey(),n=(await e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:On(t)})).toJSON();return await et.pushSubscribe({endpoint:n.endpoint||``,keys:n.keys||{}}),!0}async function Mn(){let e=await(await navigator.serviceWorker.ready).pushManager.getSubscription();e&&(await et.pushUnsubscribe(e.endpoint),await e.unsubscribe())}var Nn=`nms-push-prompt-dismissed`,Pn=7;function Fn(){try{let e=Number(localStorage.getItem(Nn)||0);return e>0&&Date.now()-e<Pn*864e5}catch{return!1}}function In(){let{t:e}=M(),[t,n]=(0,j.useState)(!1),[r,i]=(0,j.useState)(!1);if((0,j.useEffect)(()=>{if(!kn())return;let e=!0;return An().then(async t=>{if(e&&t===`unsubscribed`){if(Notification.permission===`granted`){try{await jn()}catch{}return}Notification.permission==="default"&&!Fn()&&n(!0)}}),()=>{e=!1}},[]),!t)return null;let a=async()=>{i(!0);try{await jn()?P.success(e(`cmp_pprompt.problemNotificationsAreOn`)):P.error(e(`cmp_pprompt.notificationPermissionDenied`)),n(!1)}catch(e){P.error(e.message||`Gagal mengaktifkan notifikasi`)}finally{i(!1)}},o=()=>{try{localStorage.setItem(Nn,String(Date.now()))}catch{}n(!1)};return(0,N.jsx)(`div`,{className:`fixed z-[70] left-3 right-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-96`,children:(0,N.jsxs)(`div`,{className:`bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start`,children:[(0,N.jsx)(xe,{size:20,className:`text-accent shrink-0 mt-0.5`}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,N.jsx)(`p`,{className:`text-sm font-semibold text-tx1`,children:e(`cmp_pprompt.turnOnProblemNotifications`)}),(0,N.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:e(`cmp_pprompt.getOltOnuAlerts`)}),(0,N.jsxs)(`div`,{className:`flex gap-2 mt-3`,children:[(0,N.jsx)(`button`,{onClick:a,disabled:r,className:`btn-primary text-xs disabled:opacity-50`,children:e(`cmp_pprompt.turnOn`)}),(0,N.jsx)(`button`,{onClick:o,className:`px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1`,children:e(`cmp_pprompt.later`)})]})]}),(0,N.jsx)(`button`,{onClick:o,className:`p-1 text-tx3 hover:text-tx1`,"aria-label":`close`,children:(0,N.jsx)(T,{size:16})})]})})}var Ln=`nms-update-dismissed-sha`,Rn=216e5,zn=15e3;async function Bn(){let e=e=>new Promise(t=>setTimeout(t,e)),t=async()=>{try{return(await fetch(`/api/public/branding`,{cache:`no-store`})).ok}catch{return!1}};await e(4e3);for(let n=0;n<45;n++){if(await t()){await e(1500);return}await e(2e3)}}function Vn(){let{t:e}=M(),{user:t}=F(),n=Ee(),r=we(),[i,a]=(0,j.useState)(null),[s,c]=(0,j.useState)(`idle`),l=!!t?.is_super_admin;if((0,j.useEffect)(()=>{if(!l)return;let e=!0,t=async()=>{try{let t=await(await fetch(`/api/system/update/check`,{credentials:`include`})).json();if(!e||!t.success||t.up_to_date||!t.remote_sha)return;let n=``;try{n=localStorage.getItem(Ln)||``}catch{}n!==t.remote_sha&&a(t)}catch{}},n=window.setTimeout(t,zn),r=window.setInterval(t,Rn);return()=>{e=!1,window.clearTimeout(n),window.clearInterval(r)}},[l]),!i||r.pathname.includes(`/settings/update`))return null;let u=()=>{try{localStorage.setItem(Ln,i.remote_sha||``)}catch{}a(null)},d=()=>{a(null),n(`/dashboard/settings/update`)},f=async()=>{if(confirm(`Pasang update sekarang? Kode terbaru diambil dari GitHub lalu service di-restart — aplikasi tidak bisa diakses beberapa detik.`)){c(`applying`);try{let e=await(await fetch(`/api/system/update/apply`,{method:`POST`,credentials:`include`,headers:{"Content-Type":`application/json`,"X-Requested-With":`XMLHttpRequest`}})).json();if(!e.success){P.error(e.message||`Update gagal`),c(`idle`);return}if(!e.restarted){P.success(e.message),c(`idle`),a(null);return}c(`restarting`),await Bn();try{let e=await navigator.serviceWorker?.getRegistrations?.();await Promise.all((e||[]).map(e=>e.update().catch(()=>void 0)))}catch{}window.location.reload()}catch{P.error(e(`cmp_update.failedToApplyThe`)),c(`idle`)}}},p=i.commits||[];return(0,N.jsx)(`div`,{className:`fixed z-[70] left-3 right-3 top-20 md:left-auto md:right-6 md:w-96`,children:(0,N.jsxs)(`div`,{className:`bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start`,children:[(0,N.jsx)(o,{size:20,className:`text-accent shrink-0 mt-0.5`}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,N.jsx)(`p`,{className:`text-sm font-semibold text-tx1`,children:e(`cmp_update.updateAvailable`)}),(0,N.jsxs)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:[p.length,` perubahan baru di GitHub (`,i.local_sha,` → `,i.remote_sha,`).`]}),p.length>0&&(0,N.jsxs)(`ul`,{className:`mt-2 space-y-0.5 text-[11px] text-tx2 max-h-28 overflow-y-auto`,children:[p.slice(0,5).map(e=>(0,N.jsxs)(`li`,{className:`truncate`,children:[`• `,e.replace(/^[0-9a-f]{7,}\s+/,``)]},e)),p.length>5&&(0,N.jsxs)(`li`,{className:`text-tx3`,children:[`… dan `,p.length-5,` lainnya`]})]}),s===`idle`?(0,N.jsxs)(`div`,{className:`flex flex-wrap gap-2 mt-3`,children:[(0,N.jsx)(`button`,{onClick:f,className:`btn-primary text-xs`,children:e(`cmp_update.updateNow`)}),(0,N.jsx)(`button`,{onClick:d,className:`px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1`,children:`Detail`}),(0,N.jsx)(`button`,{onClick:u,className:`px-3 py-1.5 rounded-xl text-xs text-tx3 hover:text-tx1`,children:e(`cmp_update.later`)})]}):(0,N.jsxs)(`p`,{className:`flex items-center gap-2 mt-3 text-xs text-tx2`,children:[(0,N.jsx)(re,{size:14,className:`animate-spin`}),s===`applying`?`Mengambil update dari GitHub…`:`Service memulai ulang — halaman dimuat ulang otomatis…`]})]}),s===`idle`&&(0,N.jsx)(`button`,{onClick:u,className:`p-1 text-tx3 hover:text-tx1`,"aria-label":`close`,children:(0,N.jsx)(T,{size:16})})]})})}var Hn=`/dashboard/onus?filter=problem`,Un=[{labelKey:`nav.home`,icon:ye,path:`/dashboard`,end:!0},{labelKey:`nav.allOnus`,icon:m,path:`/dashboard/onus`,end:!0},{labelKey:`nav.problems`,icon:x,path:Hn,end:!0},{labelKey:`nav.olt`,icon:ae,path:`/dashboard/settings/olts`,end:!1}];function Wn(){let{t:e}=M(),[t,n]=(0,j.useState)(()=>window.innerWidth<1024),[r,i]=(0,j.useState)(!1),a=we();(0,j.useEffect)(()=>{i(!1)},[a.pathname]),(0,j.useEffect)(()=>{let e=()=>{window.innerWidth>=1024&&i(!1)};return window.addEventListener(`resize`,e),()=>window.removeEventListener(`resize`,e)},[]);let o=Un,{data:s}=Ve({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),c=s?.unregistered||0,l=(s?.offline_count||0)+(s?.dyinggasp_count||0)+(s?.los_count||0),u=a.pathname===`/dashboard/onus`&&new URLSearchParams(a.search).get(`filter`)===`problem`;return(0,N.jsx)(Jt,{children:(0,N.jsxs)(`div`,{className:`min-h-screen bg-[var(--bg-primary)] transition-colors duration-300`,children:[(0,N.jsx)(en,{}),(0,N.jsx)(Dn,{}),(0,N.jsx)(In,{}),(0,N.jsx)(Vn,{}),(0,N.jsx)(`div`,{className:`app-mesh-bg`,"aria-hidden":`true`}),(0,N.jsx)(Ut,{collapsed:t,mobileOpen:r,onToggle:()=>n(!t),onMobileClose:()=>i(!1)}),(0,N.jsxs)(`div`,{className:A(`relative z-10 transition-all duration-300 min-h-screen`,t?`lg:ml-[70px]`:`lg:ml-[260px]`),children:[(0,N.jsx)($t,{onMenuClick:()=>i(!r)}),(0,N.jsx)(`main`,{className:`p-3 pb-20 lg:pb-6 md:p-4 lg:p-6 overflow-x-hidden max-w-[100vw]`,children:(0,N.jsx)(`div`,{className:`page-enter`,children:(0,N.jsx)(Ce,{})},a.pathname)})]}),(0,N.jsx)(`nav`,{className:`fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-xl border-t border-brd lg:hidden mobile-bottom-nav`,children:(0,N.jsxs)(`div`,{className:`flex items-center justify-around h-14 px-1`,children:[o.map(t=>{let n=t.icon,r=t.path===Hn,i=r?l:t.path===`/dashboard/onus`?c:0,a=r?`bg-danger`:`bg-warning`;return(0,N.jsx)(ke,{to:t.path,end:t.end,className:({isActive:e})=>{let n=r?u:t.path===`/dashboard/onus`?e&&!u:e;return A(`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all relative`,n?`text-accent`:`text-tx3`)},children:({isActive:o})=>{let s=r?u:t.path===`/dashboard/onus`?o&&!u:o;return(0,N.jsxs)(N.Fragment,{children:[(0,N.jsxs)(`div`,{className:A(`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all`,s?`bg-accent/15 scale-105`:`scale-100`),children:[(0,N.jsx)(n,{size:20,strokeWidth:s?2.2:1.8}),i>0&&(0,N.jsx)(`div`,{className:A(`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center`,a),children:i>99?`99+`:i})]}),(0,N.jsx)(`span`,{children:e(t.labelKey)})]})}},t.path)}),(0,N.jsxs)(`button`,{type:`button`,onClick:()=>i(!0),"aria-expanded":r,className:A(`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all`,r?`text-accent`:`text-tx3`),children:[(0,N.jsx)(`div`,{className:`flex items-center justify-center w-8 h-8 rounded-lg`,children:(0,N.jsx)(b,{size:20,strokeWidth:1.8})}),(0,N.jsx)(`span`,{children:e(`nav.more`)})]})]})})]})})}var Gn={olt:ae,onu:m,odp:ce,odc:ge,otb:s,user:pe},Kn={olt:`/dashboard/olt-settings`,onu:`/dashboard/onu`,odp:`/dashboard/ftth`,odc:`/dashboard/ftth`,otb:`/dashboard/ftth`,user:`/dashboard/users`},qn={olt:`OLT`,onu:`ONU`,odp:`ODP`,odc:`ODC`,otb:`OTB`,user:`User`};function Jn(){let{t:e}=M(),[t,n]=(0,j.useState)(!1),[r,i]=(0,j.useState)(``),[a,o]=(0,j.useState)({}),[s,l]=(0,j.useState)(!1),[u,d]=(0,j.useState)(0),f=Ee(),p=(0,j.useRef)(null),h=(0,j.useRef)(void 0);(0,j.useEffect)(()=>{let e=e=>{(e.ctrlKey||e.metaKey)&&e.key===`k`&&(e.preventDefault(),n(e=>!e),i(``),o({}),d(0)),e.key===`Escape`&&n(!1)};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[]),(0,j.useEffect)(()=>{t&&p.current?.focus()},[t]),(0,j.useEffect)(()=>{if(h.current&&clearTimeout(h.current),r.length<2){o({}),l(!1);return}l(!0),h.current=setTimeout(async()=>{try{let e=await(await fetch(`/api/search?q=${encodeURIComponent(r)}`,{credentials:`include`})).json();o(e.results||{}),d(0)}catch{o({})}finally{l(!1)}},250)},[r]);let g=[];for(let[e,t]of Object.entries(a))for(let n of t)g.push({...n,type:e});let _=(0,j.useCallback)(e=>{n(!1);let t=Kn[e.type]||`/dashboard`;f(e.type===`onu`?`${t}/${e.id}`:e.type===`odp`||e.type===`odc`||e.type===`otb`?`${t}?${e.type}=${e.id}`:t)},[f]);return t?(0,N.jsx)(`div`,{className:`fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm`,onClick:()=>n(!1),children:(0,N.jsxs)(`div`,{className:`w-full max-w-lg mx-4 bg-surface border border-brd rounded-xl shadow-2xl overflow-hidden`,onClick:e=>e.stopPropagation(),children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-3 px-4 py-3 border-b border-brd`,children:[(0,N.jsx)(c,{size:16,className:`text-tx3 flex-shrink-0`}),(0,N.jsx)(`input`,{ref:p,value:r,onChange:e=>i(e.target.value),onKeyDown:e=>{e.key===`ArrowDown`&&(e.preventDefault(),d(e=>Math.min(e+1,g.length-1))),e.key===`ArrowUp`&&(e.preventDefault(),d(e=>Math.max(e-1,0))),e.key===`Enter`&&g[u]&&_(g[u])},placeholder:e(`cmp_search.searchOnusOltsOdps`),className:`flex-1 bg-transparent text-sm outline-none placeholder:text-tx3`}),(0,N.jsx)(`kbd`,{className:`px-1.5 py-0.5 text-[10px] rounded bg-glass text-tx3 font-mono`,children:`ESC`})]}),(0,N.jsxs)(`div`,{className:`max-h-[50vh] overflow-y-auto`,children:[r.length<2&&(0,N.jsx)(`div`,{className:`px-4 py-6 text-center text-xs text-tx3`,children:e(`cmp_search.typeAtLeast2`)}),s&&(0,N.jsx)(`div`,{className:`px-4 py-4 text-center text-xs text-tx3`,children:e(`cmp_search.searching`)}),!s&&r.length>=2&&g.length===0&&(0,N.jsx)(`div`,{className:`px-4 py-6 text-center text-xs text-tx3`,children:e(`cmp_search.noResults`)}),!s&&g.map((e,t)=>{let n=Gn[e.type]||m;return(0,N.jsxs)(`button`,{onClick:()=>_(e),className:A(`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors`,t===u?`bg-accent/10 text-accent`:`hover:bg-glass text-tx2`),onMouseEnter:()=>d(t),children:[(0,N.jsx)(n,{size:15,className:t===u?`text-accent`:`text-tx3`}),(0,N.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,N.jsx)(`div`,{className:`text-sm font-medium truncate`,children:e.name}),(0,N.jsxs)(`div`,{className:`text-[10px] text-tx3 truncate`,children:[qn[e.type],e.serial?` • ${e.serial}`:``,e.ip?` • ${e.ip}`:``,e.olt?` • ${e.olt}`:``,e.status?` • ${e.status}`:``]})]}),(0,N.jsx)(`span`,{className:`text-[10px] text-tx3 uppercase flex-shrink-0`,children:e.type})]},`${e.type}-${e.id}`)})]}),(0,N.jsxs)(`div`,{className:`px-4 py-2 border-t border-brd flex items-center gap-3 text-[10px] text-tx3`,children:[(0,N.jsxs)(`span`,{children:[(0,N.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`↑↓`}),` `,e(`cmp_search.navigate`)]}),(0,N.jsxs)(`span`,{children:[(0,N.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`Enter`}),` `,e(`cmp_search.open`)]}),(0,N.jsxs)(`span`,{children:[(0,N.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`Ctrl+K`}),` `,e(`cmp_search.close`)]})]})]})}):null}var Yn=class extends j.Component{constructor(e){super(e),this.state={hasError:!1,error:null}}static getDerivedStateFromError(e){return{hasError:!0,error:e}}componentDidCatch(e,t){console.error(`ErrorBoundary caught:`,e,t)}handleReload=()=>{this.setState({hasError:!1,error:null}),window.location.reload()};render(){return this.state.hasError?(0,N.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4`,children:(0,N.jsxs)(`div`,{className:`max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center`,children:[(0,N.jsx)(`div`,{className:`mb-4 text-5xl`,children:`⚠️`}),(0,N.jsx)(`h1`,{className:`text-xl font-bold text-[var(--tx-primary)] mb-2`,children:`Something went wrong`}),(0,N.jsx)(`p`,{className:`text-sm text-[var(--tx-tertiary)] mb-4`,children:this.state.error?.message||`An unexpected error occurred.`}),(0,N.jsx)(`button`,{onClick:this.handleReload,className:`px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition`,children:`Reload Page`})]})}):this.props.children}};function Xn(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function Zn(e){if(Array.isArray(e))return e}function Qn(e){if(Array.isArray(e))return Xn(e)}function $n(e,t){if(!(e instanceof t))throw TypeError(`Cannot call a class as a function`)}function er(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,`value`in r&&(r.writable=!0),Object.defineProperty(e,ur(r.key),r)}}function tr(e,t,n){return t&&er(e.prototype,t),n&&er(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}function nr(e,t){var n=typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(!n){if(Array.isArray(e)||(n=fr(e))||t&&e&&typeof e.length==`number`){n&&(e=n);var r=0,i=function(){};return{s:i,n:function(){return r>=e.length?{done:!0}:{done:!1,value:e[r++]}},e:function(e){throw e},f:i}}throw TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}var a,o=!0,s=!1;return{s:function(){n=n.call(e)},n:function(){var e=n.next();return o=e.done,e},e:function(e){s=!0,a=e},f:function(){try{o||n.return==null||n.return()}finally{if(s)throw a}}}}function I(e,t,n){return(t=ur(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function rr(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function ir(e,t){var n=e==null?null:typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(n!=null){var r,i,a,o,s=[],c=!0,l=!1;try{if(a=(n=n.call(e)).next,t===0){if(Object(n)!==n)return;c=!1}else for(;!(c=(r=a.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){l=!0,i=e}finally{try{if(!c&&n.return!=null&&(o=n.return(),Object(o)!==o))return}finally{if(l)throw i}}return s}}function ar(){throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function or(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function sr(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function L(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?sr(Object(n),!0).forEach(function(t){I(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):sr(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function cr(e,t){return Zn(e)||ir(e,t)||fr(e,t)||ar()}function R(e){return Qn(e)||rr(e)||fr(e)||or()}function lr(e,t){if(typeof e!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(typeof r!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function ur(e){var t=lr(e,`string`);return typeof t==`symbol`?t:t+``}function dr(e){"@babel/helpers - typeof";return dr=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},dr(e)}function fr(e,t){if(e){if(typeof e==`string`)return Xn(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?Xn(e,t):void 0}}var pr=function(){},mr={},hr={},gr=null,_r={mark:pr,measure:pr};try{typeof window<`u`&&(mr=window),typeof document<`u`&&(hr=document),typeof MutationObserver<`u`&&(gr=MutationObserver),typeof performance<`u`&&(_r=performance)}catch{}var vr=(mr.navigator||{}).userAgent,yr=vr===void 0?``:vr,z=mr,B=hr,br=gr,xr=_r;z.document;var V=!!B.documentElement&&!!B.head&&typeof B.addEventListener==`function`&&typeof B.createElement==`function`,Sr=~yr.indexOf(`MSIE`)||~yr.indexOf(`Trident/`),Cr,wr=/fa(k|kd|s|r|l|t|d|dr|dl|dt|b|slr|slpr|wsb|tl|ns|nds|es|gt|jr|jfr|jdr|usb|ufsb|udsb|cr|ss|sr|sl|st|sds|sdr|sdl|sdt|sldr|slpdr|pr|ms|vs)?[\-\ ]/,Tr=/Font ?Awesome ?([567 ]*)(Solid|Regular|Light|Thin|Duotone|Brands|Free|Pro|Sharp Duotone|Sharp|Kit|Notdog Duo|Notdog|Chisel|Etch|Graphite|Thumbprint|Jelly Fill|Jelly Duo|Jelly|Utility|Utility Fill|Utility Duo|Slab Press|Slab|Slab Duo|Slab Press Duo|Pixel|Mosaic|Vellum|Whiteboard)?.*/i,Er={classic:{fa:`solid`,fas:`solid`,"fa-solid":`solid`,far:`regular`,"fa-regular":`regular`,fal:`light`,"fa-light":`light`,fat:`thin`,"fa-thin":`thin`,fab:`brands`,"fa-brands":`brands`},duotone:{fa:`solid`,fad:`solid`,"fa-solid":`solid`,"fa-duotone":`solid`,fadr:`regular`,"fa-regular":`regular`,fadl:`light`,"fa-light":`light`,fadt:`thin`,"fa-thin":`thin`},sharp:{fa:`solid`,fass:`solid`,"fa-solid":`solid`,fasr:`regular`,"fa-regular":`regular`,fasl:`light`,"fa-light":`light`,fast:`thin`,"fa-thin":`thin`},"sharp-duotone":{fa:`solid`,fasds:`solid`,"fa-solid":`solid`,fasdr:`regular`,"fa-regular":`regular`,fasdl:`light`,"fa-light":`light`,fasdt:`thin`,"fa-thin":`thin`},slab:{"fa-regular":`regular`,faslr:`regular`},"slab-press":{"fa-regular":`regular`,faslpr:`regular`},"slab-duo":{"fa-regular":`regular`,fasldr:`regular`},"slab-press-duo":{"fa-regular":`regular`,faslpdr:`regular`},thumbprint:{"fa-light":`light`,fatl:`light`},vellum:{"fa-solid":`solid`,favs:`solid`},pixel:{"fa-regular":`regular`,fapr:`regular`},mosaic:{"fa-solid":`solid`,fams:`solid`},whiteboard:{"fa-semibold":`semibold`,fawsb:`semibold`},notdog:{"fa-solid":`solid`,fans:`solid`},"notdog-duo":{"fa-solid":`solid`,fands:`solid`},etch:{"fa-solid":`solid`,faes:`solid`},graphite:{"fa-thin":`thin`,fagt:`thin`},jelly:{"fa-regular":`regular`,fajr:`regular`},"jelly-fill":{"fa-regular":`regular`,fajfr:`regular`},"jelly-duo":{"fa-regular":`regular`,fajdr:`regular`},chisel:{"fa-regular":`regular`,facr:`regular`},utility:{"fa-semibold":`semibold`,fausb:`semibold`},"utility-duo":{"fa-semibold":`semibold`,faudsb:`semibold`},"utility-fill":{"fa-semibold":`semibold`,faufsb:`semibold`}},Dr={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},Or=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`],H=`classic`,kr=`duotone`,Ar=`sharp`,jr=`sharp-duotone`,Mr=`chisel`,Nr=`etch`,Pr=`graphite`,Fr=`jelly`,Ir=`jelly-duo`,Lr=`jelly-fill`,Rr=`mosaic`,zr=`notdog`,Br=`notdog-duo`,Vr=`pixel`,Hr=`slab`,Ur=`slab-duo`,Wr=`slab-press`,Gr=`slab-press-duo`,Kr=`thumbprint`,qr=`utility`,Jr=`utility-duo`,Yr=`utility-fill`,Xr=`vellum`,Zr=`whiteboard`,Qr=`Classic`,$r=`Duotone`,ei=`Sharp`,ti=`Sharp Duotone`,ni=`Chisel`,ri=`Etch`,ii=`Graphite`,ai=`Jelly`,oi=`Jelly Duo`,si=`Jelly Fill`,ci=`Mosaic`,li=`Notdog`,ui=`Notdog Duo`,di=`Pixel`,fi=`Slab`,pi=`Slab Duo`,mi=`Slab Press`,hi=`Slab Press Duo`,gi=`Thumbprint`,_i=`Utility`,vi=`Utility Duo`,yi=`Utility Fill`,bi=`Vellum`,xi=`Whiteboard`,Si=[H,kr,Ar,jr,Mr,Nr,Pr,Fr,Ir,Lr,Rr,zr,Br,Vr,Hr,Ur,Wr,Gr,Kr,qr,Jr,Yr,Xr,Zr];Cr={},I(I(I(I(I(I(I(I(I(I(Cr,H,Qr),kr,$r),Ar,ei),jr,ti),Mr,ni),Nr,ri),Pr,ii),Fr,ai),Ir,oi),Lr,si),I(I(I(I(I(I(I(I(I(I(Cr,Rr,ci),zr,li),Br,ui),Vr,di),Hr,fi),Ur,pi),Wr,mi),Gr,hi),Kr,gi),qr,_i),I(I(I(I(Cr,Jr,vi),Yr,yi),Xr,bi),Zr,xi);var Ci={classic:{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},duotone:{900:`fad`,400:`fadr`,300:`fadl`,100:`fadt`},sharp:{900:`fass`,400:`fasr`,300:`fasl`,100:`fast`},"sharp-duotone":{900:`fasds`,400:`fasdr`,300:`fasdl`,100:`fasdt`},slab:{400:`faslr`},"slab-press":{400:`faslpr`},"slab-duo":{400:`fasldr`},"slab-press-duo":{400:`faslpdr`},vellum:{900:`favs`},mosaic:{900:`fams`},pixel:{400:`fapr`},whiteboard:{600:`fawsb`},thumbprint:{300:`fatl`},notdog:{900:`fans`},"notdog-duo":{900:`fands`},etch:{900:`faes`},graphite:{100:`fagt`},chisel:{400:`facr`},jelly:{400:`fajr`},"jelly-fill":{400:`fajfr`},"jelly-duo":{400:`fajdr`},utility:{600:`fausb`},"utility-duo":{600:`faudsb`},"utility-fill":{600:`faufsb`}},wi={"Font Awesome 7 Free":{900:`fas`,400:`far`},"Font Awesome 7 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},"Font Awesome 7 Brands":{400:`fab`,normal:`fab`},"Font Awesome 7 Duotone":{900:`fad`,400:`fadr`,normal:`fadr`,300:`fadl`,100:`fadt`},"Font Awesome 7 Sharp":{900:`fass`,400:`fasr`,normal:`fasr`,300:`fasl`,100:`fast`},"Font Awesome 7 Sharp Duotone":{900:`fasds`,400:`fasdr`,normal:`fasdr`,300:`fasdl`,100:`fasdt`},"Font Awesome 7 Jelly":{400:`fajr`,normal:`fajr`},"Font Awesome 7 Jelly Fill":{400:`fajfr`,normal:`fajfr`},"Font Awesome 7 Jelly Duo":{400:`fajdr`,normal:`fajdr`},"Font Awesome 7 Slab":{400:`faslr`,normal:`faslr`},"Font Awesome 7 Slab Press":{400:`faslpr`,normal:`faslpr`},"Font Awesome 7 Slab Duo":{400:`fasldr`,normal:`fasldr`},"Font Awesome 7 Slab Press Duo":{400:`faslpdr`,normal:`faslpdr`},"Font Awesome 7 Pixel":{400:`fapr`,normal:`fapr`},"Font Awesome 7 Mosaic":{900:`fams`,normal:`fams`},"Font Awesome 7 Vellum":{900:`favs`,normal:`favs`},"Font Awesome 7 Thumbprint":{300:`fatl`,normal:`fatl`},"Font Awesome 7 Notdog":{900:`fans`,normal:`fans`},"Font Awesome 7 Notdog Duo":{900:`fands`,normal:`fands`},"Font Awesome 7 Etch":{900:`faes`,normal:`faes`},"Font Awesome 7 Graphite":{100:`fagt`,normal:`fagt`},"Font Awesome 7 Chisel":{400:`facr`,normal:`facr`},"Font Awesome 7 Whiteboard":{600:`fawsb`,normal:`fawsb`},"Font Awesome 7 Utility":{600:`fausb`,normal:`fausb`},"Font Awesome 7 Utility Duo":{600:`faudsb`,normal:`faudsb`},"Font Awesome 7 Utility Fill":{600:`faufsb`,normal:`faufsb`}},Ti=new Map([[`classic`,{defaultShortPrefixId:`fas`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`,`brands`],futureStyleIds:[],defaultFontWeight:900}],[`duotone`,{defaultShortPrefixId:`fad`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp`,{defaultShortPrefixId:`fass`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp-duotone`,{defaultShortPrefixId:`fasds`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`chisel`,{defaultShortPrefixId:`facr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`etch`,{defaultShortPrefixId:`faes`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`graphite`,{defaultShortPrefixId:`fagt`,defaultStyleId:`thin`,styleIds:[`thin`],futureStyleIds:[],defaultFontWeight:100}],[`jelly`,{defaultShortPrefixId:`fajr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-duo`,{defaultShortPrefixId:`fajdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-fill`,{defaultShortPrefixId:`fajfr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`mosaic`,{defaultShortPrefixId:`fams`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog`,{defaultShortPrefixId:`fans`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog-duo`,{defaultShortPrefixId:`fands`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`pixel`,{defaultShortPrefixId:`fapr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab`,{defaultShortPrefixId:`faslr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-duo`,{defaultShortPrefixId:`fasldr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press`,{defaultShortPrefixId:`faslpr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press-duo`,{defaultShortPrefixId:`faslpdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`thumbprint`,{defaultShortPrefixId:`fatl`,defaultStyleId:`light`,styleIds:[`light`],futureStyleIds:[],defaultFontWeight:300}],[`utility`,{defaultShortPrefixId:`fausb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-duo`,{defaultShortPrefixId:`faudsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-fill`,{defaultShortPrefixId:`faufsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`vellum`,{defaultShortPrefixId:`favs`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`whiteboard`,{defaultShortPrefixId:`fawsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}]]),Ei={chisel:{regular:`facr`},classic:{brands:`fab`,light:`fal`,regular:`far`,solid:`fas`,thin:`fat`},duotone:{light:`fadl`,regular:`fadr`,solid:`fad`,thin:`fadt`},etch:{solid:`faes`},graphite:{thin:`fagt`},jelly:{regular:`fajr`},"jelly-duo":{regular:`fajdr`},"jelly-fill":{regular:`fajfr`},mosaic:{solid:`fams`},notdog:{solid:`fans`},"notdog-duo":{solid:`fands`},pixel:{regular:`fapr`},sharp:{light:`fasl`,regular:`fasr`,solid:`fass`,thin:`fast`},"sharp-duotone":{light:`fasdl`,regular:`fasdr`,solid:`fasds`,thin:`fasdt`},slab:{regular:`faslr`},"slab-duo":{regular:`fasldr`},"slab-press":{regular:`faslpr`},"slab-press-duo":{regular:`faslpdr`},thumbprint:{light:`fatl`},utility:{semibold:`fausb`},"utility-duo":{semibold:`faudsb`},"utility-fill":{semibold:`faufsb`},vellum:{solid:`favs`},whiteboard:{semibold:`fawsb`}},Di=[`fak`,`fa-kit`,`fakd`,`fa-kit-duotone`],Oi={kit:{fak:`kit`,"fa-kit":`kit`},"kit-duotone":{fakd:`kit-duotone`,"fa-kit-duotone":`kit-duotone`}},ki=[`kit`];I(I({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var Ai={kit:{"fa-kit":`fak`},"kit-duotone":{"fa-kit-duotone":`fakd`}},ji={"Font Awesome Kit":{400:`fak`,normal:`fak`},"Font Awesome Kit Duotone":{400:`fakd`,normal:`fakd`}},Mi={kit:{fak:`fa-kit`},"kit-duotone":{fakd:`fa-kit-duotone`}},Ni={kit:{kit:`fak`},"kit-duotone":{"kit-duotone":`fakd`}},Pi,Fi={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},Ii=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`];Pi={},I(I(I(I(I(I(I(I(I(I(Pi,`classic`,`Classic`),`duotone`,`Duotone`),`sharp`,`Sharp`),`sharp-duotone`,`Sharp Duotone`),`chisel`,`Chisel`),`etch`,`Etch`),`graphite`,`Graphite`),`jelly`,`Jelly`),`jelly-duo`,`Jelly Duo`),`jelly-fill`,`Jelly Fill`),I(I(I(I(I(I(I(I(I(I(Pi,`mosaic`,`Mosaic`),`notdog`,`Notdog`),`notdog-duo`,`Notdog Duo`),`pixel`,`Pixel`),`slab`,`Slab`),`slab-duo`,`Slab Duo`),`slab-press`,`Slab Press`),`slab-press-duo`,`Slab Press Duo`),`thumbprint`,`Thumbprint`),`utility`,`Utility`),I(I(I(I(Pi,`utility-duo`,`Utility Duo`),`utility-fill`,`Utility Fill`),`vellum`,`Vellum`),`whiteboard`,`Whiteboard`),I(I({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var Li={classic:{"fa-brands":`fab`,"fa-duotone":`fad`,"fa-light":`fal`,"fa-regular":`far`,"fa-solid":`fas`,"fa-thin":`fat`},duotone:{"fa-regular":`fadr`,"fa-light":`fadl`,"fa-thin":`fadt`},sharp:{"fa-solid":`fass`,"fa-regular":`fasr`,"fa-light":`fasl`,"fa-thin":`fast`},"sharp-duotone":{"fa-solid":`fasds`,"fa-regular":`fasdr`,"fa-light":`fasdl`,"fa-thin":`fasdt`},slab:{"fa-regular":`faslr`},"slab-press":{"fa-regular":`faslpr`},"slab-duo":{"fa-regular":`fasldr`},"slab-press-duo":{"fa-regular":`faslpdr`},pixel:{"fa-regular":`fapr`},mosaic:{"fa-solid":`fams`},vellum:{"fa-solid":`favs`},whiteboard:{"fa-semibold":`fawsb`},thumbprint:{"fa-light":`fatl`},notdog:{"fa-solid":`fans`},"notdog-duo":{"fa-solid":`fands`},etch:{"fa-solid":`faes`},graphite:{"fa-thin":`fagt`},jelly:{"fa-regular":`fajr`},"jelly-fill":{"fa-regular":`fajfr`},"jelly-duo":{"fa-regular":`fajdr`},chisel:{"fa-regular":`facr`},utility:{"fa-semibold":`fausb`},"utility-duo":{"fa-semibold":`faudsb`},"utility-fill":{"fa-semibold":`faufsb`}},Ri={classic:[`fas`,`far`,`fal`,`fat`,`fad`],duotone:[`fadr`,`fadl`,`fadt`],sharp:[`fass`,`fasr`,`fasl`,`fast`],"sharp-duotone":[`fasds`,`fasdr`,`fasdl`,`fasdt`],slab:[`faslr`],"slab-press":[`faslpr`],"slab-duo":[`fasldr`],"slab-press-duo":[`faslpdr`],pixel:[`fapr`],mosaic:[`fams`],vellum:[`favs`],whiteboard:[`fawsb`],thumbprint:[`fatl`],notdog:[`fans`],"notdog-duo":[`fands`],etch:[`faes`],graphite:[`fagt`],jelly:[`fajr`],"jelly-fill":[`fajfr`],"jelly-duo":[`fajdr`],chisel:[`facr`],utility:[`fausb`],"utility-duo":[`faudsb`],"utility-fill":[`faufsb`]},zi={classic:{fab:`fa-brands`,fad:`fa-duotone`,fal:`fa-light`,far:`fa-regular`,fas:`fa-solid`,fat:`fa-thin`},duotone:{fadr:`fa-regular`,fadl:`fa-light`,fadt:`fa-thin`},sharp:{fass:`fa-solid`,fasr:`fa-regular`,fasl:`fa-light`,fast:`fa-thin`},"sharp-duotone":{fasds:`fa-solid`,fasdr:`fa-regular`,fasdl:`fa-light`,fasdt:`fa-thin`},slab:{faslr:`fa-regular`},"slab-press":{faslpr:`fa-regular`},"slab-duo":{fasldr:`fa-regular`},"slab-press-duo":{faslpdr:`fa-regular`},pixel:{fapr:`fa-regular`},mosaic:{fams:`fa-solid`},vellum:{favs:`fa-solid`},whiteboard:{fawsb:`fa-semibold`},thumbprint:{fatl:`fa-light`},notdog:{fans:`fa-solid`},"notdog-duo":{fands:`fa-solid`},etch:{faes:`fa-solid`},graphite:{fagt:`fa-thin`},jelly:{fajr:`fa-regular`},"jelly-fill":{fajfr:`fa-regular`},"jelly-duo":{fajdr:`fa-regular`},chisel:{facr:`fa-regular`},utility:{fausb:`fa-semibold`},"utility-duo":{faudsb:`fa-semibold`},"utility-fill":{faufsb:`fa-semibold`}},Bi=`fa.fas.far.fal.fat.fad.fadr.fadl.fadt.fab.fass.fasr.fasl.fast.fasds.fasdr.fasdl.fasdt.faslr.faslpr.fasldr.faslpdr.fapr.fams.favs.fawsb.fatl.fans.fands.faes.fagt.fajr.fajfr.fajdr.facr.fausb.faudsb.faufsb`.split(`.`).concat(Ii,[`fa-solid`,`fa-regular`,`fa-light`,`fa-thin`,`fa-duotone`,`fa-brands`,`fa-semibold`]),Vi=[`solid`,`regular`,`light`,`thin`,`duotone`,`brands`,`semibold`],Hi=[1,2,3,4,5,6,7,8,9,10],Ui=Hi.concat([11,12,13,14,15,16,17,18,19,20]),Wi=[].concat(R(Object.keys(Ri)),Vi,[`aw`,`fw`,`pull-left`,`pull-right`],[`2xs`,`xs`,`sm`,`lg`,`xl`,`2xl`,`beat`,`beat-fade`,`border`,`bounce`,`buzz`,`canvas-square`,`canvas-roomy`,`fade`,`flip-360`,`flip-both`,`flip-horizontal`,`flip-vertical`,`flip`,`float`,`inverse`,`jello`,`layers`,`layers-bottom-left`,`layers-bottom-right`,`layers-counter`,`layers-text`,`layers-top-left`,`layers-top-right`,`li`,`pull-end`,`pull-start`,`pulse`,`rotate-180`,`rotate-270`,`rotate-90`,`rotate-by`,`shake`,`spin-pulse`,`spin-reverse`,`spin`,`spin-snap`,`spin-snap-4`,`spin-snap-8`,`stack-1x`,`stack-2x`,`stack`,`swing`,`ul`,`wag`,`width-auto`,`width-fixed`,Fi.GROUP,Fi.SWAP_OPACITY,Fi.PRIMARY,Fi.SECONDARY],Hi.map(function(e){return`${e}x`}),Ui.map(function(e){return`w-${e}`})),Gi={"Font Awesome 5 Free":{900:`fas`,400:`far`},"Font Awesome 5 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`},"Font Awesome 5 Brands":{400:`fab`,normal:`fab`},"Font Awesome 5 Duotone":{900:`fad`}},U=`___FONT_AWESOME___`,Ki=16,qi=`fa`,Ji=`svg-inline--fa`,Yi=`data-fa-i2svg`,Xi=`data-fa-pseudo-element`,Zi=`data-fa-pseudo-element-pending`,Qi=`data-prefix`,$i=`data-icon`,ea=`fontawesome-i2svg`,ta=`async`,na=[`HTML`,`HEAD`,`STYLE`,`SCRIPT`],ra=[`::before`,`::after`,`:before`,`:after`],ia=function(){try{return!0}catch{return!1}}();function aa(e){return new Proxy(e,{get:function(e,t){return t in e?e[t]:e[H]}})}var oa=L({},Er);oa[H]=L(L(L(L({},{"fa-duotone":`duotone`}),Er[H]),Oi.kit),Oi[`kit-duotone`]);var sa=aa(oa),ca=L({},Ei);ca[H]=L(L(L(L({},{duotone:`fad`}),ca[H]),Ni.kit),Ni[`kit-duotone`]);var la=aa(ca),ua=L({},zi);ua[H]=L(L({},ua[H]),Mi.kit);var da=aa(ua),fa=L({},Li);fa[H]=L(L({},fa[H]),Ai.kit),aa(fa);var pa=wr,ma=`fa-layers-text`,ha=Tr;aa(L({},Ci));var ga=[`class`,`data-prefix`,`data-icon`,`data-fa-transform`,`data-fa-mask`],_a=Dr,va=[].concat(R(ki),R(Wi)),ya=z.FontAwesomeConfig||{};function ba(e){var t=B.querySelector(`script[`+e+`]`);if(t)return t.getAttribute(e)}function xa(e){return e===``?!0:e===`false`?!1:e===`true`||e}B&&typeof B.querySelector==`function`&&[[`data-family-prefix`,`familyPrefix`],[`data-css-prefix`,`cssPrefix`],[`data-family-default`,`familyDefault`],[`data-style-default`,`styleDefault`],[`data-replacement-class`,`replacementClass`],[`data-auto-replace-svg`,`autoReplaceSvg`],[`data-auto-add-css`,`autoAddCss`],[`data-search-pseudo-elements`,`searchPseudoElements`],[`data-search-pseudo-elements-warnings`,`searchPseudoElementsWarnings`],[`data-search-pseudo-elements-full-scan`,`searchPseudoElementsFullScan`],[`data-observe-mutations`,`observeMutations`],[`data-mutate-approach`,`mutateApproach`],[`data-keep-original-source`,`keepOriginalSource`],[`data-measure-performance`,`measurePerformance`],[`data-show-missing-icons`,`showMissingIcons`]].forEach(function(e){var t=cr(e,2),n=t[0],r=t[1],i=xa(ba(n));i!=null&&(ya[r]=i)});var Sa={styleDefault:`solid`,familyDefault:H,cssPrefix:qi,replacementClass:Ji,autoReplaceSvg:!0,autoAddCss:!0,searchPseudoElements:!1,searchPseudoElementsWarnings:!0,searchPseudoElementsFullScan:!1,observeMutations:!0,mutateApproach:`async`,keepOriginalSource:!0,measurePerformance:!1,showMissingIcons:!0};ya.familyPrefix&&(ya.cssPrefix=ya.familyPrefix);var Ca=L(L({},Sa),ya);Ca.autoReplaceSvg||(Ca.observeMutations=!1);var W={};Object.keys(Sa).forEach(function(e){Object.defineProperty(W,e,{enumerable:!0,set:function(t){Ca[e]=t,wa.forEach(function(e){return e(W)})},get:function(){return Ca[e]}})}),Object.defineProperty(W,"familyPrefix",{enumerable:!0,set:function(e){Ca.cssPrefix=e,wa.forEach(function(e){return e(W)})},get:function(){return Ca.cssPrefix}}),z.FontAwesomeConfig=W;var wa=[];function Ta(e){return wa.push(e),function(){wa.splice(wa.indexOf(e),1)}}var G=Ki,K={size:16,x:0,y:0,rotate:0,flipX:!1,flipY:!1};function Ea(e){if(e&&V){var t=B.createElement(`style`);t.setAttribute(`type`,`text/css`),t.innerHTML=e;for(var n=B.head.childNodes,r=null,i=n.length-1;i>-1;i--){var a=n[i],o=(a.tagName||``).toUpperCase();[`STYLE`,`LINK`].indexOf(o)>-1&&(r=a)}return B.head.insertBefore(t,r),e}}var Da=`0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`;function Oa(){for(var e=12,t=``;e-->0;)t+=Da[Math.random()*62|0];return t}function ka(e){for(var t=[],n=(e||[]).length>>>0;n--;)t[n]=e[n];return t}function Aa(e){return e.classList?ka(e.classList):(e.getAttribute(`class`)||``).split(` `).filter(function(e){return e})}function ja(e){return`${e}`.replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function Ma(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}="${ja(e[n])}" `},``).trim()}function Na(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}: ${e[n].trim()};`},``)}function Pa(e){return e.size!==K.size||e.x!==K.x||e.y!==K.y||e.rotate!==K.rotate||e.flipX||e.flipY}function Fa(e){var t=e.transform,n=e.containerWidth,r=e.iconWidth;return{outer:{transform:`translate(${n/2} 256)`},inner:{transform:`${`translate(${t.x*32}, ${t.y*32}) `} ${`scale(${t.size/16*(t.flipX?-1:1)}, ${t.size/16*(t.flipY?-1:1)}) `} ${`rotate(${t.rotate} 0 0)`}`},path:{transform:`translate(${r/2*-1} -256)`}}}function Ia(e){var t=e.transform,n=e.width,r=n===void 0?Ki:n,i=e.height,a=i===void 0?Ki:i,o=e.startCentered,s=o!==void 0&&o,c=``;return c+=s&&Sr?`translate(${t.x/G-r/2}em, ${t.y/G-a/2}em) `:s?`translate(calc(-50% + ${t.x/G}em), calc(-50% + ${t.y/G}em)) `:`translate(${t.x/G}em, ${t.y/G}em) `,c+=`scale(${t.size/G*(t.flipX?-1:1)}, ${t.size/G*(t.flipY?-1:1)}) `,c+=`rotate(${t.rotate}deg) `,c}var La=`:root, :host {
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
}`;function Ra(){var e=qi,t=Ji,n=W.cssPrefix,r=W.replacementClass,i=La;if(n!==e||r!==t){var a=RegExp(`\\.${e}\\-`,`g`),o=RegExp(`\\--${e}\\-`,`g`),s=RegExp(`\\.${t}`,`g`);i=i.replace(a,`.${n}-`).replace(o,`--${n}-`).replace(s,`.${r}`)}return i}var za=!1;function Ba(){W.autoAddCss&&!za&&(Ea(Ra()),za=!0)}var Va={mixout:function(){return{dom:{css:Ra,insertCss:Ba}}},hooks:function(){return{beforeDOMElementCreation:function(){Ba()},beforeI2svg:function(){Ba()}}}},q=z||{};q[U]||(q[U]={}),q[U].styles||(q[U].styles={}),q[U].hooks||(q[U].hooks={}),q[U].shims||(q[U].shims=[]);var J=q[U],Ha=[],Ua=function(){B.removeEventListener(`DOMContentLoaded`,Ua),Wa=1,Ha.map(function(e){return e()})},Wa=!1;V&&(Wa=(B.documentElement.doScroll?/^loaded|^c/:/^loaded|^i|^c/).test(B.readyState),Wa||B.addEventListener(`DOMContentLoaded`,Ua));function Ga(e){V&&(Wa?setTimeout(e,0):Ha.push(e))}function Ka(e){var t=e.tag,n=e.attributes,r=n===void 0?{}:n,i=e.children,a=i===void 0?[]:i;return typeof e==`string`?ja(e):`<${t} ${Ma(r)}>${a.map(Ka).join(``)}</${t}>`}function qa(e,t,n){if(e&&e[t]&&e[t][n])return{prefix:t,iconName:n,icon:e[t][n]}}var Ja=function(e,t){return function(n,r,i,a){return e.call(t,n,r,i,a)}},Ya=function(e,t,n,r){var i=Object.keys(e),a=i.length,o=r===void 0?t:Ja(t,r),s,c,l;for(n===void 0?(s=1,l=e[i[0]]):(s=0,l=n);s<a;s++)c=i[s],l=o(l,e[c],c,e);return l};function Xa(e){return R(e).length===1?e.codePointAt(0).toString(16):null}function Za(e){return Object.keys(e).reduce(function(t,n){var r=e[n];return r.icon?t[r.iconName]=r.icon:t[n]=r,t},{})}function Qa(e,t){var n=(arguments.length>2&&arguments[2]!==void 0?arguments[2]:{}).skipHooks,r=n!==void 0&&n,i=Za(t);typeof J.hooks.addPack==`function`&&!r?J.hooks.addPack(e,Za(t)):J.styles[e]=L(L({},J.styles[e]||{}),i),e===`fas`&&Qa(`fa`,t)}var $a=J.styles,eo=J.shims,to=Object.keys(da),no=to.reduce(function(e,t){return e[t]=Object.keys(da[t]),e},{}),ro=null,io={},ao={},oo={},so={},co={};function lo(e){return~va.indexOf(e)}function uo(e,t){var n=t.split(`-`),r=n[0],i=n.slice(1).join(`-`);return r===e&&i!==``&&!lo(i)?i:null}var fo=function(){var e=function(e){return Ya($a,function(t,n,r){return t[r]=Ya(n,e,{}),t},{})};io=e(function(e,t,n){return t[3]&&(e[t[3]]=n),t[2]&&t[2].filter(function(e){return typeof e==`number`}).forEach(function(t){e[t.toString(16)]=n}),e}),ao=e(function(e,t,n){return e[n]=n,t[2]&&t[2].filter(function(e){return typeof e==`string`}).forEach(function(t){e[t]=n}),e}),co=e(function(e,t,n){var r=t[2];return e[n]=n,r.forEach(function(t){e[t]=n}),e});var t=`far`in $a||W.autoFetchSvg,n=Ya(eo,function(e,n){var r=n[0],i=n[1],a=n[2];return i===`far`&&!t&&(i=`fas`),typeof r==`string`&&(e.names[r]={prefix:i,iconName:a}),typeof r==`number`&&(e.unicodes[r.toString(16)]={prefix:i,iconName:a}),e},{names:{},unicodes:{}});oo=n.names,so=n.unicodes,ro=bo(W.styleDefault,{family:W.familyDefault})};Ta(function(e){ro=bo(e.styleDefault,{family:W.familyDefault})}),fo();function po(e,t){return(io[e]||{})[t]}function mo(e,t){return(ao[e]||{})[t]}function ho(e,t){return(co[e]||{})[t]}function go(e){return oo[e]||{prefix:null,iconName:null}}function _o(e){var t=so[e],n=po(`fas`,e);return t||(n?{prefix:`fas`,iconName:n}:null)||{prefix:null,iconName:null}}function Y(){return ro}var vo=function(){return{prefix:null,iconName:null,rest:[]}};function yo(e){var t=H,n=to.reduce(function(e,t){return e[t]=`${W.cssPrefix}-${t}`,e},{});return Si.forEach(function(r){(e.includes(n[r])||e.some(function(e){return no[r].includes(e)}))&&(t=r)}),t}function bo(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).family,n=t===void 0?H:t,r=sa[n][e];if(n===kr&&!e)return`fad`;var i=la[n][e]||la[n][r],a=e in J.styles?e:null;return i||a||null}function xo(e){var t=[],n=null;return e.forEach(function(e){var r=uo(W.cssPrefix,e);r?n=r:e&&t.push(e)}),{iconName:n,rest:t}}function So(e){return e.sort().filter(function(e,t,n){return n.indexOf(e)===t})}var Co=Bi.concat(Di);function wo(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).skipLookups,n=t!==void 0&&t,r=null,i=So(e.filter(function(e){return Co.includes(e)})),a=So(e.filter(function(e){return!Co.includes(e)})),o=cr(i.filter(function(e){return r=e,!Or.includes(e)}),1)[0],s=o===void 0?null:o,c=yo(i),l=L(L({},xo(a)),{},{prefix:bo(s,{family:c})});return L(L(L({},l),Oo({values:e,family:c,styles:$a,config:W,canonical:l,givenPrefix:r})),To(n,r,l))}function To(e,t,n){var r=n.prefix,i=n.iconName;if(e||!r||!i)return{prefix:r,iconName:i};var a=t===`fa`?go(i):{},o=ho(r,i);return i=a.iconName||o||i,r=a.prefix||r,r===`far`&&!$a.far&&$a.fas&&!W.autoFetchSvg&&(r=`fas`),{prefix:r,iconName:i}}var Eo=Si.filter(function(e){return e!==H||e!==kr}),Do=Object.keys(zi).filter(function(e){return e!==H}).map(function(e){return Object.keys(zi[e])}).flat();function Oo(e){var t=e.values,n=e.family,r=e.canonical,i=e.givenPrefix,a=i===void 0?``:i,o=e.styles,s=o===void 0?{}:o,c=e.config,l=c===void 0?{}:c,u=n===kr,d=t.includes(`fa-duotone`)||t.includes(`fad`),f=l.familyDefault===`duotone`,p=r.prefix===`fad`||r.prefix===`fa-duotone`;return!u&&(d||f||p)&&(r.prefix=`fad`),(t.includes(`fa-brands`)||t.includes(`fab`))&&(r.prefix=`fab`),!r.prefix&&Eo.includes(n)&&(Object.keys(s).find(function(e){return Do.includes(e)})||l.autoFetchSvg)&&(r.prefix=Ti.get(n).defaultShortPrefixId,r.iconName=ho(r.prefix,r.iconName)||r.iconName),(r.prefix===`fa`||a===`fa`)&&(r.prefix=Y()||`fas`),r}var ko=function(){function e(){$n(this,e),this.definitions={}}return tr(e,[{key:`add`,value:function(){var e=this,t=[...arguments].reduce(this._pullDefinitions,{});Object.keys(t).forEach(function(n){e.definitions[n]=L(L({},e.definitions[n]||{}),t[n]),Qa(n,t[n]);var r=da[H][n];r&&Qa(r,t[n]),fo()})}},{key:`reset`,value:function(){this.definitions={}}},{key:`_pullDefinitions`,value:function(e,t){var n=t.prefix&&t.iconName&&t.icon?{0:t}:t;return Object.keys(n).map(function(t){var r=n[t],i=r.prefix,a=r.iconName,o=r.icon,s=o[2];e[i]||(e[i]={}),s.length>0&&s.forEach(function(t){typeof t==`string`&&(e[i][t]=o)}),e[i][a]=o}),e}}])}(),Ao=[],jo={},Mo={},No=Object.keys(Mo);function Po(e,t){var n=t.mixoutsTo;return Ao=e,jo={},Object.keys(Mo).forEach(function(e){No.indexOf(e)===-1&&delete Mo[e]}),Ao.forEach(function(e){var t=e.mixout?e.mixout():{};if(Object.keys(t).forEach(function(e){typeof t[e]==`function`&&(n[e]=t[e]),dr(t[e])===`object`&&Object.keys(t[e]).forEach(function(r){n[e]||(n[e]={}),n[e][r]=t[e][r]})}),e.hooks){var r=e.hooks();Object.keys(r).forEach(function(e){jo[e]||(jo[e]=[]),jo[e].push(r[e])})}e.provides&&e.provides(Mo)}),n}function Fo(e,t){var n=[...arguments].slice(2);return(jo[e]||[]).forEach(function(e){t=e.apply(null,[t].concat(n))}),t}function Io(e){var t=[...arguments].slice(1);(jo[e]||[]).forEach(function(e){e.apply(null,t)})}function X(){var e=arguments[0],t=Array.prototype.slice.call(arguments,1);return Mo[e]?Mo[e].apply(null,t):void 0}function Lo(e){e.prefix===`fa`&&(e.prefix=`fas`);var t=e.iconName,n=e.prefix||Y();if(t)return t=ho(n,t)||t,qa(Ro.definitions,n,t)||qa(J.styles,n,t)}var Ro=new ko,Z={noAuto:function(){W.autoReplaceSvg=!1,W.observeMutations=!1,Io(`noAuto`)},config:W,dom:{i2svg:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return V?(Io(`beforeI2svg`,e),X(`pseudoElements2svg`,e),X(`i2svg`,e)):Promise.reject(Error(`Operation requires a DOM of some kind.`))},watch:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=e.autoReplaceSvgRoot;W.autoReplaceSvg===!1&&(W.autoReplaceSvg=!0),W.observeMutations=!0,Ga(function(){zo({autoReplaceSvgRoot:t}),Io(`watch`,e)})}},parse:{icon:function(e){if(e===null)return null;if(dr(e)===`object`&&e.prefix&&e.iconName)return{prefix:e.prefix,iconName:ho(e.prefix,e.iconName)||e.iconName};if(Array.isArray(e)&&e.length===2){var t=e[1].indexOf(`fa-`)===0?e[1].slice(3):e[1],n=bo(e[0]);return{prefix:n,iconName:ho(n,t)||t}}if(typeof e==`string`&&(e.indexOf(`${W.cssPrefix}-`)>-1||e.match(pa))){var r=wo(e.split(` `),{skipLookups:!0});return{prefix:r.prefix||Y(),iconName:ho(r.prefix,r.iconName)||r.iconName}}if(typeof e==`string`){var i=Y();return{prefix:i,iconName:ho(i,e)||e}}}},library:Ro,findIconDefinition:Lo,toHtml:Ka},zo=function(){var e=(arguments.length>0&&arguments[0]!==void 0?arguments[0]:{}).autoReplaceSvgRoot,t=e===void 0?B:e;(Object.keys(J.styles).length>0||W.autoFetchSvg)&&V&&W.autoReplaceSvg&&Z.dom.i2svg({node:t})};function Bo(e,t){return Object.defineProperty(e,"abstract",{get:t}),Object.defineProperty(e,"html",{get:function(){return e.abstract.map(function(e){return Ka(e)})}}),Object.defineProperty(e,"node",{get:function(){if(V){var t=B.createElement(`div`);return t.innerHTML=e.html,t.children}}}),e}function Vo(e){var t=e.children,n=e.main,r=e.mask,i=e.attributes,a=e.styles,o=e.transform;if(Pa(o)&&n.found&&!r.found){var s={x:n.width/n.height/2,y:.5};i.style=Na(L(L({},a),{},{"transform-origin":`${s.x+o.x/16}em ${s.y+o.y/16}em`}))}return[{tag:`svg`,attributes:i,children:t}]}function Ho(e){var t=e.prefix,n=e.iconName,r=e.children,i=e.attributes,a=e.symbol,o=a===!0?`${t}-${W.cssPrefix}-${n}`:a;return[{tag:`svg`,attributes:{style:`display: none;`},children:[{tag:`symbol`,attributes:L(L({},i),{},{id:o}),children:r}]}]}function Uo(e){return[`aria-label`,`aria-labelledby`,`title`,`role`].some(function(t){return t in e})}function Wo(e){var t=e.icons,n=t.main,r=t.mask,i=e.prefix,a=e.iconName,o=e.transform,s=e.symbol,c=e.maskId,l=e.extra,u=e.watchable,d=u!==void 0&&u,f=r.found?r:n,p=f.width,m=f.height,h=[W.replacementClass,a?`${W.cssPrefix}-${a}`:``].filter(function(e){return l.classes.indexOf(e)===-1}).filter(function(e){return e!==``||!!e}).concat(l.classes).join(` `),g={children:[],attributes:L(L({},l.attributes),{},{"data-prefix":i,"data-icon":a,class:h,role:l.attributes.role||`img`,viewBox:`0 0 ${p} ${m}`})};!Uo(l.attributes)&&!l.attributes[`aria-hidden`]&&(g.attributes[`aria-hidden`]=`true`),d&&(g.attributes[Yi]=``);var _=L(L({},g),{},{prefix:i,iconName:a,main:n,mask:r,maskId:c,transform:o,symbol:s,styles:L({},l.styles)}),v=r.found&&n.found?X(`generateAbstractMask`,_)||{children:[],attributes:{}}:X(`generateAbstractIcon`,_)||{children:[],attributes:{}},y=v.children,b=v.attributes;return _.children=y,_.attributes=b,s?Ho(_):Vo(_)}function Go(e){var t=e.content,n=e.width,r=e.height,i=e.transform,a=e.extra,o=e.watchable,s=o!==void 0&&o,c=L(L({},a.attributes),{},{class:a.classes.join(` `)});s&&(c[Yi]=``);var l=L({},a.styles);Pa(i)&&(l.transform=Ia({transform:i,startCentered:!0,width:n,height:r}),l[`-webkit-transform`]=l.transform);var u=Na(l);u.length>0&&(c.style=u);var d=[];return d.push({tag:`span`,attributes:c,children:[t]}),d}function Ko(e){var t=e.content,n=e.extra,r=L(L({},n.attributes),{},{class:n.classes.join(` `)}),i=Na(n.styles);i.length>0&&(r.style=i);var a=[];return a.push({tag:`span`,attributes:r,children:[t]}),a}var qo=J.styles;function Jo(e){var t=e[0],n=e[1],r=cr(e.slice(4),1)[0],i=null;return i=Array.isArray(r)?{tag:`g`,attributes:{class:`${W.cssPrefix}-${_a.GROUP}`},children:[{tag:`path`,attributes:{class:`${W.cssPrefix}-${_a.SECONDARY}`,fill:`currentColor`,d:r[0]}},{tag:`path`,attributes:{class:`${W.cssPrefix}-${_a.PRIMARY}`,fill:`currentColor`,d:r[1]}}]}:{tag:`path`,attributes:{fill:`currentColor`,d:r}},{found:!0,width:t,height:n,icon:i}}var Yo={found:!1,width:512,height:512};function Xo(e,t){!ia&&!W.showMissingIcons&&e&&console.error(`Icon with name "${e}" and prefix "${t}" is missing.`)}function Zo(e,t){var n=t;return t===`fa`&&W.styleDefault!==null&&(t=Y()),new Promise(function(r,i){if(n===`fa`){var a=go(e)||{};e=a.iconName||e,t=a.prefix||t}if(e&&t&&qo[t]&&qo[t][e]){var o=qo[t][e];return r(Jo(o))}Xo(e,t),r(L(L({},Yo),{},{icon:W.showMissingIcons&&e&&X(`missingIconAbstract`)||{}}))})}var Qo=function(){},$o=W.measurePerformance&&xr&&xr.mark&&xr.measure?xr:{mark:Qo,measure:Qo},es=`FA "7.3.1"`,ts=function(e){return $o.mark(`${es} ${e} begins`),function(){return ns(e)}},ns=function(e){$o.mark(`${es} ${e} ends`),$o.measure(`${es} ${e}`,`${es} ${e} begins`,`${es} ${e} ends`)},rs={begin:ts,end:ns},is=function(){};function as(e){return typeof(e.getAttribute?e.getAttribute(Yi):null)==`string`}function os(e){var t=e.getAttribute?e.getAttribute(Qi):null,n=e.getAttribute?e.getAttribute($i):null;return t&&n}function ss(e){return e&&e.classList&&e.classList.contains&&e.classList.contains(W.replacementClass)}function cs(){return W.autoReplaceSvg===!0?ps.replace:ps[W.autoReplaceSvg]||ps.replace}function ls(e){return B.createElementNS(`http://www.w3.org/2000/svg`,e)}function us(e){return B.createElement(e)}function ds(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).ceFn,n=t===void 0?e.tag===`svg`?ls:us:t;if(typeof e==`string`)return B.createTextNode(e);var r=n(e.tag);return Object.keys(e.attributes||[]).forEach(function(t){r.setAttribute(t,e.attributes[t])}),(e.children||[]).forEach(function(e){r.appendChild(ds(e,{ceFn:n}))}),r}function fs(e){var t=` ${e.outerHTML} `;return t=`${t}Font Awesome fontawesome.com `,t}var ps={replace:function(e){var t=e[0];if(t.parentNode){if(e[1].forEach(function(e){t.parentNode.insertBefore(ds(e),t)}),t.getAttribute(Yi)===null&&W.keepOriginalSource){var n=B.createComment(fs(t));t.parentNode.replaceChild(n,t)}else t.remove()}},nest:function(e){var t=e[0],n=e[1];if(~Aa(t).indexOf(W.replacementClass))return ps.replace(e);var r=RegExp(`${W.cssPrefix}-.*`);if(delete n[0].attributes.id,n[0].attributes.class){var i=n[0].attributes.class.split(` `).reduce(function(e,t){return t===W.replacementClass||t.match(r)?e.toSvg.push(t):e.toNode.push(t),e},{toNode:[],toSvg:[]});n[0].attributes.class=i.toSvg.join(` `),i.toNode.length===0?t.removeAttribute(`class`):t.setAttribute(`class`,i.toNode.join(` `))}var a=n.map(function(e){return Ka(e)}).join(`
`);t.setAttribute(Yi,``),t.innerHTML=a}};function ms(e){e()}function hs(e,t){var n=typeof t==`function`?t:is;if(e.length===0)n();else{var r=ms;W.mutateApproach===ta&&(r=z.requestAnimationFrame||ms),r(function(){var t=cs(),r=rs.begin(`mutate`);e.map(t),r(),n()})}}var gs=!1;function _s(){gs=!0}function vs(){gs=!1}var ys=null;function bs(e){if(br&&W.observeMutations){var t=e.treeCallback,n=t===void 0?is:t,r=e.nodeCallback,i=r===void 0?is:r,a=e.pseudoElementsCallback,o=a===void 0?is:a,s=e.observeMutationsRoot,c=s===void 0?B:s;ys=new br(function(e){if(!gs){var t=Y();ka(e).forEach(function(e){if(e.type===`childList`&&e.addedNodes.length>0&&!as(e.addedNodes[0])&&(W.searchPseudoElements&&o(e.target),n(e.target)),e.type===`attributes`&&e.target.parentNode&&W.searchPseudoElements&&o([e.target],!0),e.type===`attributes`&&as(e.target)&&~ga.indexOf(e.attributeName)){if(e.attributeName===`class`&&os(e.target)){var r=wo(Aa(e.target)),a=r.prefix,s=r.iconName;e.target.setAttribute(Qi,a||t),s&&e.target.setAttribute($i,s)}else ss(e.target)&&i(e.target)}})}}),V&&ys.observe(c,{childList:!0,attributes:!0,characterData:!0,subtree:!0})}}function xs(){ys&&ys.disconnect()}function Ss(e){var t=e.getAttribute(`style`),n=[];return t&&(n=t.split(`;`).reduce(function(e,t){var n=t.split(`:`),r=n[0],i=n.slice(1);return r&&i.length>0&&(e[r]=i.join(`:`).trim()),e},{})),n}function Cs(e){var t=e.getAttribute(`data-prefix`),n=e.getAttribute(`data-icon`),r=e.innerText===void 0?``:e.innerText.trim(),i=wo(Aa(e));return i.prefix||=Y(),t&&n&&(i.prefix=t,i.iconName=n),i.iconName&&i.prefix?i:(i.prefix&&r.length>0&&(i.iconName=mo(i.prefix,e.innerText)||po(i.prefix,Xa(e.innerText))),!i.iconName&&W.autoFetchSvg&&e.firstChild&&e.firstChild.nodeType===Node.TEXT_NODE&&(i.iconName=e.firstChild.data),i)}function ws(e){return ka(e.attributes).reduce(function(e,t){return e.name!==`class`&&e.name!==`style`&&(e[t.name]=t.value),e},{})}function Ts(){return{iconName:null,prefix:null,transform:K,symbol:!1,mask:{iconName:null,prefix:null,rest:[]},maskId:null,extra:{classes:[],styles:{},attributes:{}}}}function Es(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{styleParser:!0},n=Cs(e),r=n.iconName,i=n.prefix,a=n.rest,o=ws(e),s=Fo(`parseNodeAttributes`,{},e);return L({iconName:r,prefix:i,transform:K,mask:{iconName:null,prefix:null,rest:[]},maskId:null,symbol:!1,extra:{classes:a,styles:t.styleParser?Ss(e):[],attributes:o}},s)}var Ds=J.styles;function Os(e){var t=W.autoReplaceSvg===`nest`?Es(e,{styleParser:!1}):Es(e);return~t.extra.classes.indexOf(ma)?X(`generateLayersText`,e,t):X(`generateSvgReplacementMutation`,e,t)}function ks(){return[].concat(R(Di),R(Bi))}function As(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;if(!V)return Promise.resolve();var n=B.documentElement.classList,r=function(e){return n.add(`${ea}-${e}`)},i=function(e){return n.remove(`${ea}-${e}`)},a=W.autoFetchSvg?ks():Or.concat(Object.keys(Ds));a.includes(`fa`)||a.push(`fa`);var o=[`.${ma}:not([${Yi}])`].concat(a.map(function(e){return`.${e}:not([${Yi}])`})).join(`, `);if(o.length===0)return Promise.resolve();var s=[];try{s=ka(e.querySelectorAll(o))}catch{}if(s.length>0)r(`pending`),i(`complete`);else return Promise.resolve();var c=rs.begin(`onTree`),l=s.reduce(function(e,t){try{var n=Os(t);n&&e.push(n)}catch(e){ia||e.name===`MissingIcon`&&console.error(e)}return e},[]);return new Promise(function(e,n){Promise.all(l).then(function(n){hs(n,function(){r(`active`),r(`complete`),i(`pending`),typeof t==`function`&&t(),c(),e()})}).catch(function(e){c(),n(e)})})}function js(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;Os(e).then(function(e){e&&hs([e],t)})}function Ms(e){return function(t){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},r=(t||{}).icon?t:Lo(t||{}),i=n.mask;return i&&=(i||{}).icon?i:Lo(i||{}),e(r,L(L({},n),{},{mask:i}))}}var Ns=function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?K:n,i=t.symbol,a=i!==void 0&&i,o=t.mask,s=o===void 0?null:o,c=t.maskId,l=c===void 0?null:c,u=t.classes,d=u===void 0?[]:u,f=t.attributes,p=f===void 0?{}:f,m=t.styles,h=m===void 0?{}:m;if(e){var g=e.prefix,_=e.iconName,v=e.icon;return Bo(L({type:`icon`},e),function(){return Io(`beforeDOMElementCreation`,{iconDefinition:e,params:t}),Wo({icons:{main:Jo(v),mask:s?Jo(s.icon):{found:!1,width:null,height:null,icon:{}}},prefix:g,iconName:_,transform:L(L({},K),r),symbol:a,maskId:l,extra:{attributes:p,styles:h,classes:d}})})}},Ps={mixout:function(){return{icon:Ms(Ns)}},hooks:function(){return{mutationObserverCallbacks:function(e){return e.treeCallback=As,e.nodeCallback=js,e}}},provides:function(e){e.i2svg=function(e){var t=e.node,n=t===void 0?B:t,r=e.callback;return As(n,r===void 0?function(){}:r)},e.generateSvgReplacementMutation=function(e,t){var n=t.iconName,r=t.prefix,i=t.transform,a=t.symbol,o=t.mask,s=t.maskId,c=t.extra;return new Promise(function(t,l){Promise.all([Zo(n,r),o.iconName?Zo(o.iconName,o.prefix):Promise.resolve({found:!1,width:512,height:512,icon:{}})]).then(function(o){var l=cr(o,2),u=l[0],d=l[1];t([e,Wo({icons:{main:u,mask:d},prefix:r,iconName:n,transform:i,symbol:a,maskId:s,extra:c,watchable:!0})])}).catch(l)})},e.generateAbstractIcon=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.transform,a=e.styles,o=Na(a);o.length>0&&(n.style=o);var s;return Pa(i)&&(s=X(`generateAbstractTransformGrouping`,{main:r,transform:i,containerWidth:r.width,iconWidth:r.width})),t.push(s||r.icon),{children:t,attributes:n}}}},Fs={mixout:function(){return{layer:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.classes,r=n===void 0?[]:n;return Bo({type:`layer`},function(){Io(`beforeDOMElementCreation`,{assembler:e,params:t});var n=[];return e(function(e){Array.isArray(e)?e.map(function(e){n=n.concat(e.abstract)}):n=n.concat(e.abstract)}),[{tag:`span`,attributes:{class:[`${W.cssPrefix}-layers`].concat(R(r)).join(` `)},children:n}]})}}}},Is={mixout:function(){return{counter:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.title,r=n===void 0?null:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return Bo({type:`counter`,content:e},function(){return Io(`beforeDOMElementCreation`,{content:e,params:t}),Ko({content:e.toString(),title:r,extra:{attributes:s,styles:l,classes:[`${W.cssPrefix}-layers-counter`].concat(R(a))}})})}}}},Ls={mixout:function(){return{text:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?K:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return Bo({type:`text`,content:e},function(){return Io(`beforeDOMElementCreation`,{content:e,params:t}),Go({content:e,transform:L(L({},K),r),extra:{attributes:s,styles:l,classes:[`${W.cssPrefix}-layers-text`].concat(R(a))}})})}}},provides:function(e){e.generateLayersText=function(e,t){var n=t.transform,r=t.extra,i=null,a=null;if(Sr){var o=parseInt(getComputedStyle(e).fontSize,10),s=e.getBoundingClientRect();i=s.width/o,a=s.height/o}return Promise.resolve([e,Go({content:e.innerHTML,width:i,height:a,transform:n,extra:r,watchable:!0})])}}},Rs=RegExp(`"`,`ug`),zs=[1105920,1112319],Bs=L(L(L(L({},{FontAwesome:{normal:`fas`,400:`fas`}}),wi),Gi),ji),Vs=Object.keys(Bs).reduce(function(e,t){return e[t.toLowerCase()]=Bs[t],e},{}),Hs=Object.keys(Vs).reduce(function(e,t){var n=Vs[t];return e[t]=n[900]||R(Object.entries(n))[0][1],e},{});function Us(e){return Xa(R(e.replace(Rs,``))[0]||``)}function Ws(e){var t=e.getPropertyValue(`font-feature-settings`).includes(`ss01`),n=e.getPropertyValue(`content`).replace(Rs,``),r=n.codePointAt(0),i=r>=zs[0]&&r<=zs[1],a=n.length===2&&n[0]===n[1];return i||a||t}function Gs(e,t){var n=e.replace(/^['"]|['"]$/g,``).toLowerCase(),r=parseInt(t),i=isNaN(r)?`normal`:r;return(Vs[n]||{})[i]||Hs[n]}function Ks(e,t){var n=`${Zi}${t.replace(`:`,`-`)}`;return new Promise(function(r,i){if(e.getAttribute(n)!==null)return r();var a=ka(e.children).filter(function(e){return e.getAttribute(Xi)===t})[0],o=z.getComputedStyle(e,t),s=o.getPropertyValue(`font-family`),c=s.match(ha),l=o.getPropertyValue(`font-weight`),u=o.getPropertyValue(`content`);if(a&&!c)return e.removeChild(a),r();if(c&&u!==`none`&&u!==``){var d=o.getPropertyValue(`content`),f=Gs(s,l),p=Us(d),m=c[0].startsWith(`FontAwesome`),h=Ws(o),g=po(f,p),_=g;if(m){var v=_o(p);v.iconName&&v.prefix&&(g=v.iconName,f=v.prefix)}if(g&&!h&&(!a||a.getAttribute(Qi)!==f||a.getAttribute($i)!==_)){e.setAttribute(n,_),a&&e.removeChild(a);var y=Ts(),b=y.extra;b.attributes[Xi]=t,Zo(g,f).then(function(i){var a=Wo(L(L({},y),{},{icons:{main:i,mask:vo()},prefix:f,iconName:_,extra:b,watchable:!0})),o=B.createElementNS(`http://www.w3.org/2000/svg`,`svg`);t===`::before`?e.insertBefore(o,e.firstChild):e.appendChild(o),o.outerHTML=a.map(function(e){return Ka(e)}).join(`
`),e.removeAttribute(n),r()}).catch(i)}else r()}else r()})}function qs(e){return Promise.all([Ks(e,`::before`),Ks(e,`::after`)])}function Js(e){return e.parentNode!==document.head&&!~na.indexOf(e.tagName.toUpperCase())&&!e.getAttribute(Xi)&&(!e.parentNode||e.parentNode.tagName!==`svg`)}var Ys=function(e){return!!e&&ra.some(function(t){return e.includes(t)})},Xs=function(e){if(!e)return[];var t=new Set,n=e.split(/,(?![^()]*\))/).map(function(e){return e.trim()});n=n.flatMap(function(e){return e.includes(`(`)?e:e.split(`,`).map(function(e){return e.trim()})});var r=nr(n),i;try{for(r.s();!(i=r.n()).done;){var a=i.value;if(Ys(a)){var o=ra.reduce(function(e,t){return e.replace(t,``)},a);o!==``&&o!==`*`&&t.add(o)}}}catch(e){r.e(e)}finally{r.f()}return t};function Zs(e){var t=arguments.length>1&&arguments[1]!==void 0&&arguments[1];if(V){var n;if(t)n=e;else if(W.searchPseudoElementsFullScan)n=e.querySelectorAll(`*`);else{var r=new Set,i=nr(document.styleSheets),a;try{for(i.s();!(a=i.n()).done;){var o=a.value;try{var s=nr(o.cssRules),c;try{for(s.s();!(c=s.n()).done;){var l=c.value,u=nr(Xs(l.selectorText)),d;try{for(u.s();!(d=u.n()).done;){var f=d.value;r.add(f)}}catch(e){u.e(e)}finally{u.f()}}}catch(e){s.e(e)}finally{s.f()}}catch(e){W.searchPseudoElementsWarnings&&console.warn(`Font Awesome: cannot parse stylesheet: ${o.href} (${e.message})
If it declares any Font Awesome CSS pseudo-elements, they will not be rendered as SVG icons. Add crossorigin="anonymous" to the <link>, enable searchPseudoElementsFullScan for slower but more thorough DOM parsing, or suppress this warning by setting searchPseudoElementsWarnings to false.`)}}}catch(e){i.e(e)}finally{i.f()}if(!r.size)return;var p=Array.from(r).join(`, `);try{n=e.querySelectorAll(p)}catch{}}return new Promise(function(e,t){var r=ka(n).filter(Js).map(qs),i=rs.begin(`searchPseudoElements`);_s(),Promise.all(r).then(function(){i(),vs(),e()}).catch(function(){i(),vs(),t()})})}}var Qs={hooks:function(){return{mutationObserverCallbacks:function(e){return e.pseudoElementsCallback=Zs,e}}},provides:function(e){e.pseudoElements2svg=function(e){var t=e.node,n=t===void 0?B:t;W.searchPseudoElements&&Zs(n)}}},$s=!1,ec={mixout:function(){return{dom:{unwatch:function(){_s(),$s=!0}}}},hooks:function(){return{bootstrap:function(){bs(Fo(`mutationObserverCallbacks`,{}))},noAuto:function(){xs()},watch:function(e){var t=e.observeMutationsRoot;$s?vs():bs(Fo(`mutationObserverCallbacks`,{observeMutationsRoot:t}))}}}},tc=function(e){return e.toLowerCase().split(` `).reduce(function(e,t){var n=t.toLowerCase().split(`-`),r=n[0],i=n.slice(1).join(`-`);if(r&&i===`h`)return e.flipX=!0,e;if(r&&i===`v`)return e.flipY=!0,e;if(i=parseFloat(i),isNaN(i))return e;switch(r){case`grow`:e.size+=i;break;case`shrink`:e.size-=i;break;case`left`:e.x-=i;break;case`right`:e.x+=i;break;case`up`:e.y-=i;break;case`down`:e.y+=i;break;case`rotate`:e.rotate+=i}return e},{size:16,x:0,y:0,flipX:!1,flipY:!1,rotate:0})},nc={mixout:function(){return{parse:{transform:function(e){return tc(e)}}}},hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-transform`);return n&&(e.transform=tc(n)),e}}},provides:function(e){e.generateAbstractTransformGrouping=function(e){var t=e.main,n=e.transform,r=e.containerWidth,i=e.iconWidth,a={outer:{transform:`translate(${r/2} 256)`},inner:{transform:`${`translate(${n.x*32}, ${n.y*32}) `} ${`scale(${n.size/16*(n.flipX?-1:1)}, ${n.size/16*(n.flipY?-1:1)}) `} ${`rotate(${n.rotate} 0 0)`}`},path:{transform:`translate(${i/2*-1} -256)`}};return{tag:`g`,attributes:L({},a.outer),children:[{tag:`g`,attributes:L({},a.inner),children:[{tag:t.icon.tag,children:t.icon.children,attributes:L(L({},t.icon.attributes),a.path)}]}]}}}},rc={x:0,y:0,width:`100%`,height:`100%`};function ic(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!0;return e.attributes&&(e.attributes.fill||t)&&(e.attributes.fill=`black`),e}function ac(e){return e.tag===`g`?e.children:[e]}Po([Va,Ps,Fs,Is,Ls,Qs,ec,nc,{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-mask`),r=n?wo(n.split(` `).map(function(e){return e.trim()})):vo();return r.prefix||=Y(),e.mask=r,e.maskId=t.getAttribute(`data-fa-mask-id`),e}}},provides:function(e){e.generateAbstractMask=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.mask,a=e.maskId,o=e.transform,s=r.width,c=r.icon,l=i.width,u=i.icon,d=Fa({transform:o,containerWidth:l,iconWidth:s}),f={tag:`rect`,attributes:L(L({},rc),{},{fill:`white`})},p=c.children?{children:c.children.map(ic)}:{},m={tag:`g`,attributes:L({},d.inner),children:[ic(L({tag:c.tag,attributes:L(L({},c.attributes),d.path)},p))]},h={tag:`g`,attributes:L({},d.outer),children:[m]},g=`mask-${a||Oa()}`,_=`clip-${a||Oa()}`,v={tag:`mask`,attributes:L(L({},rc),{},{id:g,maskUnits:`userSpaceOnUse`,maskContentUnits:`userSpaceOnUse`}),children:[f,h]},y={tag:`defs`,children:[{tag:`clipPath`,attributes:{id:_},children:ac(u)},v]};return t.push(y,{tag:`rect`,attributes:L({fill:`currentColor`,"clip-path":`url(#${_})`,mask:`url(#${g})`},rc)}),{children:t,attributes:n}}}},{provides:function(e){var t=!1;z.matchMedia&&(t=z.matchMedia(`(prefers-reduced-motion: reduce)`).matches),e.missingIconAbstract=function(){var e=[],n={fill:`currentColor`},r={attributeType:`XML`,repeatCount:`indefinite`,dur:`2s`};e.push({tag:`path`,attributes:L(L({},n),{},{d:`M156.5,447.7l-12.6,29.5c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7C127.6,430.5,141.5,440,156.5,447.7z M40.6,272H8.5 c1.4,21.2,5.4,41.7,11.7,61.1L50,321.2C45.1,305.5,41.8,289,40.6,272z M40.6,240c1.4-18.8,5.2-37,11.1-54.1l-29.5-12.6 C14.7,194.3,10,216.7,8.5,240H40.6z M64.3,156.5c7.8-14.9,17.2-28.8,28.1-41.5L69.7,92.3c-13.7,15.6-25.5,32.8-34.9,51.5 L64.3,156.5z M397,419.6c-13.9,12-29.4,22.3-46.1,30.4l11.9,29.8c20.7-9.9,39.8-22.6,56.9-37.6L397,419.6z M115,92.4 c13.9-12,29.4-22.3,46.1-30.4l-11.9-29.8c-20.7,9.9-39.8,22.6-56.8,37.6L115,92.4z M447.7,355.5c-7.8,14.9-17.2,28.8-28.1,41.5 l22.7,22.7c13.7-15.6,25.5-32.9,34.9-51.5L447.7,355.5z M471.4,272c-1.4,18.8-5.2,37-11.1,54.1l29.5,12.6 c7.5-21.1,12.2-43.5,13.6-66.8H471.4z M321.2,462c-15.7,5-32.2,8.2-49.2,9.4v32.1c21.2-1.4,41.7-5.4,61.1-11.7L321.2,462z M240,471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6,29.5c21.1,7.5,43.5,12.2,66.8,13.6V471.4z M462,190.8c5,15.7,8.2,32.2,9.4,49.2h32.1 c-1.4-21.2-5.4-41.7-11.7-61.1L462,190.8z M92.4,397c-12-13.9-22.3-29.4-30.4-46.1l-29.8,11.9c9.9,20.7,22.6,39.8,37.6,56.9 L92.4,397z M272,40.6c18.8,1.4,36.9,5.2,54.1,11.1l12.6-29.5C317.7,14.7,295.3,10,272,8.5V40.6z M190.8,50 c15.7-5,32.2-8.2,49.2-9.4V8.5c-21.2,1.4-41.7,5.4-61.1,11.7L190.8,50z M442.3,92.3L419.6,115c12,13.9,22.3,29.4,30.5,46.1 l29.8-11.9C470,128.5,457.3,109.4,442.3,92.3z M397,92.4l22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6,29.5 C370.4,72.1,384.4,81.5,397,92.4z`})});var i=L(L({},r),{},{attributeName:`opacity`}),a={tag:`circle`,attributes:L(L({},n),{},{cx:`256`,cy:`364`,r:`28`}),children:[]};return t||a.children.push({tag:`animate`,attributes:L(L({},r),{},{attributeName:`r`,values:`28;14;28;28;14;28;`})},{tag:`animate`,attributes:L(L({},i),{},{values:`1;0;1;1;0;1;`})}),e.push(a),e.push({tag:`path`,attributes:L(L({},n),{},{opacity:`1`,d:`M263.7,312h-16c-6.6,0-12-5.4-12-12c0-71,77.4-63.9,77.4-107.8c0-20-17.8-40.2-57.4-40.2c-29.1,0-44.3,9.6-59.2,28.7 c-3.9,5-11.1,6-16.2,2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2c21.2-27.2,46.4-44.7,91.2-44.7c52.3,0,97.4,29.8,97.4,80.2 c0,67.6-77.4,63.5-77.4,107.8C275.7,306.6,270.3,312,263.7,312z`}),children:t?[]:[{tag:`animate`,attributes:L(L({},i),{},{values:`1;0;0;0;0;1;`})}]}),t||e.push({tag:`path`,attributes:L(L({},n),{},{opacity:`0`,d:`M232.5,134.5l7,168c0.3,6.4,5.6,11.5,12,11.5h9c6.4,0,11.7-5.1,12-11.5l7-168c0.3-6.8-5.2-12.5-12-12.5h-23 C237.7,122,232.2,127.7,232.5,134.5z`}),children:[{tag:`animate`,attributes:L(L({},i),{},{values:`0;0;1;1;0;0;`})}]}),{tag:`g`,attributes:{class:`missing`},children:e}}}},{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-symbol`);return e.symbol=n===null?!1:n===``||n,e}}}}],{mixoutsTo:Z}),Z.noAuto;var oc=Z.config;Z.library,Z.dom;var sc=Z.parse;Z.findIconDefinition,Z.toHtml;var cc=Z.icon;Z.layer,Z.text,Z.counter;function lc(e){return e-=0,e===e}function uc(e){return lc(e)?e:(e=e.replace(/[_-]+(.)?/g,(e,t)=>t?t.toUpperCase():``),e.charAt(0).toLowerCase()+e.slice(1))}var dc=(e,t)=>j.createElement(`stop`,{key:`${t}-${e.offset}`,offset:e.offset,stopColor:e.color,...e.opacity!==void 0&&{stopOpacity:e.opacity}});function fc(e){return e.charAt(0).toUpperCase()+e.slice(1)}var pc=new Map,mc=1e3;function hc(e){if(pc.has(e))return pc.get(e);let t={},n=0,r=e.length;for(;n<r;){let i=e.indexOf(`;`,n),a=i===-1?r:i,o=e.slice(n,a).trim();if(o){let e=o.indexOf(`:`);if(e>0){let n=o.slice(0,e).trim(),r=o.slice(e+1).trim();if(n&&r){let e=uc(n);t[e.startsWith(`webkit`)?fc(e):e]=r}}}n=a+1}if(pc.size===mc){let e=pc.keys().next().value;e&&pc.delete(e)}return pc.set(e,t),t}function gc(e,t,n={}){if(typeof t==`string`)return t;let r=(t.children||[]).map(t=>{let r=t;return(`fill`in n||n.gradientFill)&&t.tag===`path`&&`fill`in t.attributes&&(r={...t,attributes:{...t.attributes,fill:void 0}}),gc(e,r)}),i=t.attributes||{},a={};for(let[e,t]of Object.entries(i))switch(!0){case e===`class`:a.className=t;break;case e===`style`:a.style=hc(String(t));break;case e.startsWith(`aria-`):case e.startsWith(`data-`):a[e.toLowerCase()]=t;break;default:a[uc(e)]=t}let{style:o,role:s,"aria-label":c,gradientFill:l,...u}=n;if(o&&(a.style=a.style?{...a.style,...o}:o),s&&(a.role=s),c&&(a[`aria-label`]=c,a[`aria-hidden`]=`false`),l){a.fill=`url(#${l.id})`;let{type:t,stops:n=[],...i}=l;r.unshift(e(t===`linear`?`linearGradient`:`radialGradient`,{...i,id:l.id},n.map(dc)))}return e(t.tag,{...a,...u},...r)}var _c=gc.bind(null,j.createElement),vc=(e,t)=>{let n=(0,j.useId)();return e||(t?n:void 0)},yc=class{constructor(e=`react-fontawesome`){this.enabled=!1;let t=!1;try{t=typeof process<`u`&&!1}catch{}this.scope=e,this.enabled=t}log(...e){this.enabled&&console.log(`[${this.scope}]`,...e)}warn(...e){this.enabled&&console.warn(`[${this.scope}]`,...e)}error(...e){this.enabled&&console.error(`[${this.scope}]`,...e)}};typeof process<`u`&&{}.FA_VERSION;var bc=`searchPseudoElementsFullScan`in oc&&typeof oc.searchPseudoElementsFullScan==`boolean`?`7.0.0`:`6.0.0`,xc=Number.parseInt(bc)>=7,Sc=()=>xc,Cc=`fa`,Q={beat:`fa-beat`,fade:`fa-fade`,beatFade:`fa-beat-fade`,bounce:`fa-bounce`,shake:`fa-shake`,spin:`fa-spin`,spinPulse:`fa-spin-pulse`,spinReverse:`fa-spin-reverse`,pulse:`fa-pulse`,flip360:`fa-flip-360`,buzz:`fa-buzz`,float:`fa-float`,jello:`fa-jello`,spinSnap:`fa-spin-snap`,spinSnap4:`fa-spin-snap-4`,spinSnap8:`fa-spin-snap-8`,swing:`fa-swing`,wag:`fa-wag`},wc={left:`fa-pull-left`,right:`fa-pull-right`},Tc={90:`fa-rotate-90`,180:`fa-rotate-180`,270:`fa-rotate-270`},Ec={"2xs":`fa-2xs`,xs:`fa-xs`,sm:`fa-sm`,lg:`fa-lg`,xl:`fa-xl`,"2xl":`fa-2xl`,"1x":`fa-1x`,"2x":`fa-2x`,"3x":`fa-3x`,"4x":`fa-4x`,"5x":`fa-5x`,"6x":`fa-6x`,"7x":`fa-7x`,"8x":`fa-8x`,"9x":`fa-9x`,"10x":`fa-10x`},$={border:`fa-border`,fixedWidth:`fa-fw`,flip:`fa-flip`,flipHorizontal:`fa-flip-horizontal`,flipVertical:`fa-flip-vertical`,inverse:`fa-inverse`,rotateBy:`fa-rotate-by`,swapOpacity:`fa-swap-opacity`,widthAuto:`fa-width-auto`,canvasSquare:`fa-canvas-square`,canvasRoomy:`fa-canvas-roomy`},Dc={default:`fa-layers`};function Oc(e){let t=oc.cssPrefix||oc.familyPrefix||Cc;return t===Cc?e:e.replace(new RegExp(String.raw`(?<=^|\s)${Cc}-`,`g`),`${t}-`)}function kc(e){let{beat:t,fade:n,beatFade:r,bounce:i,shake:a,spin:o,spinPulse:s,spinReverse:c,pulse:l,fixedWidth:u,inverse:d,border:f,flip:p,size:m,rotation:h,pull:g,swapOpacity:_,rotateBy:v,widthAuto:y,canvasSquare:b,canvasRoomy:x,flip360:ee,buzz:S,float:te,jello:ne,spinSnap:re,spinSnap4:ie,spinSnap8:ae,swing:oe,wag:C,className:se}=e,w=[];return se&&w.push(...se.split(` `)),t&&w.push(Q.beat),n&&w.push(Q.fade),r&&w.push(Q.beatFade),i&&w.push(Q.bounce),a&&w.push(Q.shake),o&&w.push(Q.spin),c&&w.push(Q.spinReverse),s&&w.push(Q.spinPulse),l&&w.push(Q.pulse),u&&w.push($.fixedWidth),d&&w.push($.inverse),f&&w.push($.border),p===!0&&w.push($.flip),(p===`horizontal`||p===`both`)&&w.push($.flipHorizontal),(p===`vertical`||p===`both`)&&w.push($.flipVertical),m!=null&&w.push(Ec[m]),h!=null&&h!==0&&w.push(Tc[h]),g!=null&&w.push(wc[g]),_&&w.push($.swapOpacity),Sc()?(v&&w.push($.rotateBy),y&&w.push($.widthAuto),b&&w.push($.canvasSquare),x&&w.push($.canvasRoomy),ee&&w.push(Q.flip360),S&&w.push(Q.buzz),te&&w.push(Q.float),ne&&w.push(Q.jello),re&&w.push(Q.spinSnap),ie&&w.push(Q.spinSnap4),ae&&w.push(Q.spinSnap8),oe&&w.push(Q.swing),C&&w.push(Q.wag),(oc.cssPrefix||oc.familyPrefix||Cc)===Cc?w:w.map(Oc)):w}var Ac=e=>typeof e==`object`&&`icon`in e&&!!e.icon;function jc(e){if(e)return Ac(e)?e:sc.icon(e)}function Mc(e){return Object.keys(e)}var Nc=new yc(`FontAwesomeIcon`),Pc={border:!1,className:``,mask:void 0,maskId:void 0,fixedWidth:!1,inverse:!1,flip:!1,icon:void 0,listItem:!1,pull:void 0,pulse:!1,rotation:void 0,rotateBy:!1,size:void 0,spin:!1,spinPulse:!1,spinReverse:!1,beat:!1,fade:!1,beatFade:!1,bounce:!1,shake:!1,symbol:!1,title:``,titleId:void 0,transform:void 0,swapOpacity:!1,widthAuto:!1,canvasSquare:!1,canvasRoomy:!1,flip360:!1,buzz:!1,float:!1,jello:!1,spinSnap:!1,spinSnap4:!1,spinSnap8:!1,swing:!1,wag:!1},Fc=new Set(Object.keys(Pc)),Ic=j.forwardRef((e,t)=>{let n={...Pc,...e},{icon:r,mask:i,symbol:a,title:o,titleId:s,maskId:c,transform:l}=n,u=vc(c,!!i),d=vc(s,!!o),f=jc(r);if(!f)return Nc.error(`Icon lookup is undefined`,r),null;let p=kc(n),m=typeof l==`string`?sc.transform(l):l,h=jc(i),g=cc(f,{...p.length>0&&{classes:p},...m&&{transform:m},...h&&{mask:h},symbol:a,title:o,titleId:d,maskId:u});if(!g)return Nc.error(`Could not find icon`,f),null;let{abstract:_}=g,v={ref:t};for(let e of Mc(n))Fc.has(e)||(v[e]=n[e]);return _c(_[0],v)});Ic.displayName=`FontAwesomeIcon`,`${Dc.default}${$.fixedWidth}`;var Lc={prefix:`fas`,iconName:`server`,icon:[448,512,[],`f233`,`M64 32C28.7 32 0 60.7 0 96l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64c0-35.3-28.7-64-64-64L64 32zm216 72a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm56 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zM64 288c-35.3 0-64 28.7-64 64l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64c0-35.3-28.7-64-64-64L64 288zm216 72a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm56 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z`]},Rc={prefix:`fas`,iconName:`shield-halved`,icon:[512,512,[`shield-alt`],`f3ed`,`M256 0c4.6 0 9.2 1 13.4 2.9L457.8 82.8c22 9.3 38.4 31 38.3 57.2-.5 99.2-41.3 280.7-213.6 363.2-16.7 8-36.1 8-52.8 0-172.4-82.5-213.1-264-213.6-363.2-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.9 1 251.4 0 256 0zm0 66.8l0 378.1c138-66.8 175.1-214.8 176-303.4l-176-74.6 0 0z`]},zc={prefix:`fas`,iconName:`tower-broadcast`,icon:[576,512,[`broadcast-tower`],`f519`,`M87.9 11.5c-11.3-6.9-26.1-3.2-33 8.1-24.8 41-39 89.1-39 140.4s14.2 99.4 39 140.4c6.9 11.3 21.6 15 33 8.1s15-21.6 8.1-33C75.7 241.9 64 202.3 64 160S75.7 78.1 96.1 44.4c6.9-11.3 3.2-26.1-8.1-33zm400.1 0c-11.3 6.9-15 21.6-8.1 33 20.4 33.7 32.1 73.3 32.1 115.6s-11.7 81.9-32.1 115.6c-6.9 11.3-3.2 26.1 8.1 33s26.1 3.2 33-8.1c24.8-41 39-89.1 39-140.4S545.8 60.6 521 19.6c-6.9-11.3-21.6-15-33-8.1zM320 215.4c19.1-11.1 32-31.7 32-55.4 0-35.3-28.7-64-64-64s-64 28.7-64 64c0 23.7 12.9 44.4 32 55.4L256 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-264.6zM180.2 91c7.2-11.2 3.9-26-7.2-33.2s-26-3.9-33.2 7.2c-17.6 27.4-27.8 60-27.8 95s10.2 67.6 27.8 95c7.2 11.2 22 14.4 33.2 7.2s14.4-22 7.2-33.2c-12.8-19.9-20.2-43.6-20.2-69s7.4-49.1 20.2-69zM436.2 65c-7.2-11.2-22-14.4-33.2-7.2s-14.4 22-7.2 33.2c12.8 19.9 20.2 43.6 20.2 69s-7.4 49.1-20.2 69c-7.2 11.2-3.9 26 7.2 33.2s26 3.9 33.2-7.2c17.6-27.4 27.8-60 27.8-95s-10.2-67.6-27.8-95z`]},Bc=[{icon:{prefix:`fas`,iconName:`bolt`,icon:[448,512,[9889,`zap`],`f0e7`,`M338.8-9.9c11.9 8.6 16.3 24.2 10.9 37.8L271.3 224 416 224c13.5 0 25.5 8.4 30.1 21.1s.7 26.9-9.6 35.5l-288 240c-11.3 9.4-27.4 9.9-39.3 1.3s-16.3-24.2-10.9-37.8L176.7 288 32 288c-13.5 0-25.5-8.4-30.1-21.1s-.7-26.9 9.6-35.5l288-240c11.3-9.4 27.4-9.9 39.3-1.3z`]},titleKey:`login.feat1Title`,descKey:`login.feat1Desc`},{icon:zc,titleKey:`login.feat2Title`,descKey:`login.feat2Desc`},{icon:Lc,titleKey:`login.feat3Title`,descKey:`login.feat3Desc`},{icon:Rc,titleKey:`login.feat4Title`,descKey:`login.feat4Desc`}];function Vc({children:e,brandName:t,logoUrl:n}){let{t:r}=M();return(0,N.jsxs)(`div`,{className:`min-h-screen flex bg-[var(--bg-primary)] text-tx1`,children:[(0,N.jsxs)(`div`,{className:`hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 border-r border-brd bg-surface`,children:[(0,N.jsx)(`div`,{className:`absolute inset-0 pointer-events-none`,style:{backgroundImage:`radial-gradient(720px 420px at 15% 12%, rgba(14, 165, 233, 0.08), transparent 70%)`}}),(0,N.jsx)(`div`,{className:`relative z-10`,children:(0,N.jsxs)(`div`,{className:`flex items-center gap-3`,children:[(0,N.jsx)(`div`,{className:`relative flex-shrink-0`,children:(0,N.jsx)(`div`,{className:A(`relative w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border border-brd`,n?`bg-white p-1.5`:`bg-accent/10`),children:n?(0,N.jsx)(`img`,{src:n,alt:t,className:`w-full h-full object-contain`}):(0,N.jsx)(Ic,{icon:zc,className:`text-accent`,style:{fontSize:20}})})}),(0,N.jsxs)(`div`,{children:[(0,N.jsx)(`h1`,{className:`text-lg font-bold font-display tracking-tight`,children:t}),(0,N.jsx)(`p`,{className:`text-xs text-tx3`,children:r(`login.tagline`)})]})]})}),(0,N.jsxs)(`div`,{className:`relative z-10 flex-1 flex flex-col justify-center max-w-md`,children:[(0,N.jsx)(`h2`,{className:`text-3xl font-bold font-display leading-tight mb-3 text-tx1`,children:r(`login.hero`)}),(0,N.jsx)(`p`,{className:`text-sm text-tx2 leading-relaxed mb-8`,children:r(`login.heroSub`)}),(0,N.jsx)(`div`,{className:`space-y-3`,children:Bc.map(e=>(0,N.jsxs)(`div`,{className:`flex items-start gap-3 p-3 rounded-lg bg-glass/60 border border-brd`,children:[(0,N.jsx)(`div`,{className:`icon-badge w-9 h-9 flex-shrink-0 mt-0.5`,children:(0,N.jsx)(Ic,{icon:e.icon,style:{fontSize:14}})}),(0,N.jsxs)(`div`,{children:[(0,N.jsx)(`p`,{className:`text-sm font-medium text-tx1`,children:r(e.titleKey)}),(0,N.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:r(e.descKey)})]})]},e.titleKey))})]}),(0,N.jsxs)(`div`,{className:`relative z-10 pt-4 border-t border-brd flex items-center justify-between text-xs text-tx3`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,N.jsx)(`span`,{className:`w-2 h-2 rounded-full bg-success`}),(0,N.jsx)(`span`,{children:r(`login.footerReady`)})]}),(0,N.jsxs)(`div`,{className:`flex items-center gap-2 font-mono`,children:[(0,N.jsx)(ie,{size:13,className:`text-accent`}),(0,N.jsx)(`span`,{children:`GPON · EPON · TR-069`})]})]})]}),(0,N.jsxs)(`div`,{className:`w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-y-auto`,children:[(0,N.jsxs)(`div`,{className:`lg:hidden fixed top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2`,children:[(0,N.jsx)(`div`,{className:A(`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden border border-brd`,n?`bg-white p-1.5`:`bg-accent/10`),children:n?(0,N.jsx)(`img`,{src:n,alt:t,className:`w-full h-full object-contain`}):(0,N.jsx)(Ic,{icon:zc,className:`text-accent`,style:{fontSize:18}})}),(0,N.jsx)(`h1`,{className:`text-base font-bold font-display`,children:t})]}),(0,N.jsx)(`div`,{className:`relative w-full max-w-md mt-20 lg:mt-0`,children:e})]})]})}function Hc(){let{t:e}=M(),[t,n]=(0,j.useState)(``),[r,i]=(0,j.useState)(``),[o,s]=(0,j.useState)(!1),[c,l]=(0,j.useState)(!1),[u,d]=(0,j.useState)(!1),{login:f,user:m,loading:g}=F(),_=Ee(),[v,y]=(0,j.useState)(``),[b,x]=(0,j.useState)(null),[ee,te]=(0,j.useState)(!1),[ne,re]=(0,j.useState)(``),[ie,ae]=(0,j.useState)(!1),[oe,C]=(0,j.useState)(!1),se=window.location.hostname===`nms.salfa.my.id`||window.location.hostname===`localhost`||window.location.hostname===`127.0.0.1`;return(0,j.useEffect)(()=>{fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{y(e.nms_name||`FiberNMS`),x(e.logo_url||null)}).catch(()=>{y(`FiberNMS`)})},[]),g?null:m?(0,N.jsx)(Te,{to:`/dashboard`,replace:!0}):(0,N.jsxs)(Vc,{brandName:v,logoUrl:b,children:[(0,N.jsxs)(rn,{bodyClassName:`p-6 sm:p-8`,children:[(0,N.jsx)(`h2`,{className:`text-xl font-semibold mb-1 font-display`,children:e(`login.signIn`)}),(0,N.jsx)(`p`,{className:`text-xs text-tx3 mb-6`,children:e(`login.subtitle`)}),(0,N.jsxs)(`form`,{onSubmit:async n=>{if(n.preventDefault(),l(!0),await f(t,r)){l(!1),d(!0),P.success(e(`login.welcome`));let t=F.getState().user;await new Promise(e=>setTimeout(e,550)),t?.is_super_admin?_(`/dashboard/admin`):_(`/dashboard`)}else{let t=F.getState(),n=t.errorCode?e(`error.${t.errorCode}`,{seconds:t.errorData?.retry_after}):t.error||e(`error.invalid_credentials`);P.error(n),l(!1)}},className:`space-y-5`,children:[(0,N.jsx)(pn,{label:e(`login.username`),type:`text`,value:t,onChange:e=>n(e.target.value),placeholder:e(`login.usernamePh`),className:`h-11`,autoFocus:!0,required:!0}),(0,N.jsx)(pn,{label:e(`login.password`),type:o?`text`:`password`,value:r,onChange:e=>i(e.target.value),placeholder:e(`login.passwordPh`),className:`h-11`,required:!0,suffix:(0,N.jsx)(`button`,{type:`button`,onClick:()=>s(!o),className:`hover:text-tx2 transition-colors`,children:o?(0,N.jsx)(a,{size:18}):(0,N.jsx)(h,{size:18})})}),(0,N.jsx)(fn,{type:`submit`,variant:`primary`,loading:c,disabled:c||u,className:A(`w-full h-11 glow-accent transition-colors duration-300`,u&&`cursor-default`),style:u?{background:`var(--color-success)`}:void 0,children:u?(0,N.jsxs)(`span`,{className:`inline-flex items-center gap-1.5 animate-check-pop`,children:[(0,N.jsx)(S,{size:18,strokeWidth:3}),e(`login.success`)]}):e(c?`login.signingIn`:`login.signIn`)})]}),!se&&!ee&&(0,N.jsx)(`div`,{className:`text-center mt-4`,children:(0,N.jsxs)(`button`,{type:`button`,onClick:()=>{te(!0)},className:`text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1.5`,children:[(0,N.jsx)(p,{size:14}),e(`login.forgot`)]})}),(0,N.jsx)(`p`,{className:`text-center text-xs text-tx3 mt-6`,children:e(`login.secure`)})]}),ee&&(0,N.jsxs)(rn,{className:`mt-4`,bodyClassName:`p-6 sm:p-8`,children:[(0,N.jsxs)(`div`,{className:`flex items-center gap-3 mb-6`,children:[(0,N.jsx)(`button`,{type:`button`,onClick:()=>{te(!1),C(!1),re(``)},className:`text-tx3 hover:text-tx2 transition-colors`,children:(0,N.jsx)(ve,{size:20})}),(0,N.jsx)(`h2`,{className:`text-xl font-semibold font-display`,children:e(`login.resetTitle`)})]}),oe?(0,N.jsxs)(`div`,{className:`text-center py-4`,children:[(0,N.jsx)(`div`,{className:`w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4`,children:(0,N.jsxs)(`svg`,{width:`28`,height:`28`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,className:`text-success`,children:[(0,N.jsx)(`path`,{d:`M22 11.08V12a10 10 0 11-5.93-9.14`}),(0,N.jsx)(`polyline`,{points:`22 4 12 14.01 9 11.01`})]})}),(0,N.jsx)(`p`,{className:`text-sm text-tx2 mb-2`,children:e(`login.resetSent`)}),(0,N.jsx)(`p`,{className:`text-xs text-tx3`,children:e(`login.resetSentHint`)}),(0,N.jsx)(fn,{type:`button`,variant:`primary`,className:`mt-6`,onClick:()=>{te(!1),C(!1),re(``)},children:e(`login.backToLogin`)})]}):(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`p`,{className:`text-sm text-tx3 mb-5`,children:e(`login.resetHint`)}),(0,N.jsxs)(`form`,{onSubmit:async t=>{t.preventDefault(),ae(!0);try{let t=await(await fetch(`/api/public/forgot-password`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({identifier:ne})})).json();t.success?(C(!0),P.success(e(`login.resetRequestSent`))):P.error(t.message||e(`error.generic`))}catch{P.error(e(`login.networkError`))}ae(!1)},className:`space-y-5`,children:[(0,N.jsx)(pn,{label:e(`login.username`),type:`text`,value:ne,onChange:e=>re(e.target.value),placeholder:e(`login.usernamePh`),className:`h-11`,autoFocus:!0,required:!0}),(0,N.jsx)(fn,{type:`submit`,variant:`primary`,loading:ie,className:`w-full h-11 glow-accent`,children:e(ie?`login.sending`:`login.sendReset`)})]})]})]})]})}var Uc=(0,j.lazy)(()=>E(()=>import(`./Dashboard-Dxj-9SIR.js`).then(e=>({default:e.Dashboard})),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13]))),Wc=(0,j.lazy)(()=>E(()=>import(`./AllOnus-ZjIaobCx.js`).then(e=>({default:e.AllOnus})),__vite__mapDeps([14,1,2,3,4,5,6,7,8,9,10,11,15,12,16,13]))),Gc=(0,j.lazy)(()=>E(()=>import(`./ViewOnu-BBipb5Ht.js`).then(e=>({default:e.ViewOnu})),__vite__mapDeps([17,1,2,3,4,5,6,7,10,12,16,18,19]))),Kc=(0,j.lazy)(()=>E(()=>import(`./AddOnu-B_XaTst5.js`).then(e=>({default:e.AddOnu})),__vite__mapDeps([20,1,2,3,4,5,6,7,8,9,10]))),qc=(0,j.lazy)(()=>E(()=>import(`./OltSettings-Dkri_rZj.js`).then(e=>({default:e.OltSettings})),__vite__mapDeps([21,1,2,3,4,5,6,7,8,9,10,12]))),Jc=(0,j.lazy)(()=>E(()=>import(`./MikrotikSettings-C8MWBO7i.js`).then(e=>({default:e.MikrotikSettings})),__vite__mapDeps([22,1,2,4,7,8,5,6,9,10,3,12]))),Yc=(0,j.lazy)(()=>E(()=>import(`./UserManagement-Cyj4ROx2.js`).then(e=>({default:e.UserManagement})),__vite__mapDeps([23,1,2,4,7,8,5,6,9,10,3,12]))),Xc=(0,j.lazy)(()=>E(()=>import(`./Customization-BWZSnDF9.js`).then(e=>({default:e.Customization})),__vite__mapDeps([24,1,2,3,4,5,6,7,8,9,10,12]))),Zc=(0,j.lazy)(()=>E(()=>import(`./RegisterWizard-BdW8vJ03.js`).then(e=>({default:e.RegisterWizard})),__vite__mapDeps([25,1,2,3,4,5,6,7,15,26]))),Qc=(0,j.lazy)(()=>E(()=>import(`./ProvisionWizard-KALrEiun.js`).then(e=>({default:e.ProvisionWizard})),__vite__mapDeps([27,1,2,3,4,5,6,7,8,9,10,15,26]))),$c=(0,j.lazy)(()=>E(()=>import(`./OltConfiguration-C1JZmnxm.js`).then(e=>({default:e.OltConfiguration})),__vite__mapDeps([28,1,2,3,4,5,6,7,10,12,18]))),el=(0,j.lazy)(()=>E(()=>import(`./MyProfile-ByW0kFGe.js`).then(e=>({default:e.MyProfile})),__vite__mapDeps([29,1,2,4,7,8,5,6,9,10,3,30]))),tl=(0,j.lazy)(()=>E(()=>import(`./AlertSettings-v0RZTF3j.js`).then(e=>({default:e.AlertSettings})),__vite__mapDeps([31,1,2,4,5,6,8,9,10,3,30,7]))),nl=(0,j.lazy)(()=>E(()=>import(`./FtthInfrastructure-6kSQGcN8.js`).then(e=>({default:e.FtthInfrastructure})),__vite__mapDeps([32,1,2,3,4,5,6,7,8,9,10,12,16]))),rl=(0,j.lazy)(()=>E(()=>import(`./Templates-CGNnQKvl.js`).then(e=>({default:e.default})),__vite__mapDeps([33,1,2,3,4,5,6,7,8,9,10]))),il=(0,j.lazy)(()=>E(()=>import(`./Tr069Profile-C1LyR3gU.js`).then(e=>({default:e.default})),__vite__mapDeps([34,1,2,4,7,8,5,6,9,10,3,12]))),al=(0,j.lazy)(()=>E(()=>import(`./ActionLogs-bTmNDKCE.js`).then(e=>({default:e.ActionLogs})),__vite__mapDeps([35,1,2,4,5,6,7,8,9,10,3,11]))),ol=(0,j.lazy)(()=>E(()=>import(`./AlertHistory-CtHNHMBe.js`).then(e=>({default:e.AlertHistory})),__vite__mapDeps([36,1,2,4,5,6,8,9,10,3]))),sl=(0,j.lazy)(()=>E(()=>import(`./Traffic-Dy0TeaEb.js`).then(e=>({default:e.Traffic})),__vite__mapDeps([37,1,2,4,5,6,7,8,9,10,3,11,18,19]))),cl=(0,j.lazy)(()=>E(()=>import(`./AiAgentSettings-rRV8CzJY.js`).then(e=>({default:e.AiAgentSettings})),__vite__mapDeps([38,1,2,4,7,8,5,6,9,10,3]))),ll=(0,j.lazy)(()=>E(()=>import(`./CloudflareTunnel-CLb9pSOM.js`).then(e=>({default:e.CloudflareTunnel})),__vite__mapDeps([39,1,2,4,8,5,6,9,10,3]))),ul=(0,j.lazy)(()=>E(()=>import(`./GuidePage-ClRK7LVl.js`).then(e=>({default:e.GuidePage})),__vite__mapDeps([40,1,2,4,8,5,6,9,10,3,11]))),dl=(0,j.lazy)(()=>E(()=>import(`./UnconfiguredOnus-CYNc1DKM.js`).then(e=>({default:e.UnconfiguredOnus})),__vite__mapDeps([41,1,2,3,4,5,6,7,8,9,10]))),fl=(0,j.lazy)(()=>E(()=>import(`./OnuWizard-DmHvjZz3.js`).then(e=>({default:e.OnuWizard})),__vite__mapDeps([42,1,2,3,4,5,6,7,8,9,10,26]))),pl=(0,j.lazy)(()=>E(()=>import(`./SystemUpdate-BhINAB2W.js`).then(e=>({default:e.SystemUpdate})),__vite__mapDeps([43,1,2,4,8,5,6,9,10,3]))),ml=(0,j.lazy)(()=>E(()=>import(`./OltLogs-cguzEMr6.js`).then(e=>({default:e.OltLogs})),__vite__mapDeps([44,1,2,4,5,6,7,8,9,10,3]))),hl=(0,j.lazy)(()=>E(()=>import(`./AutoProvision-C5ok4L6s.js`).then(e=>({default:e.AutoProvision})),__vite__mapDeps([45,1,2,4,8,5,6,9,10,3]))),gl=(0,j.lazy)(()=>E(()=>import(`./Reports-Bln518BL.js`).then(e=>({default:e.Reports})),__vite__mapDeps([46,1,2,4,8,5,6,12]))),_l=(0,j.lazy)(()=>E(()=>import(`./Terminal-WI5Nxn-G.js`).then(e=>({default:e.Terminal})),__vite__mapDeps([47,1,2,3,4,7,8,5,6,12,48]))),vl={"/dashboard/onus/add":`add_onu`,"/dashboard/onus/register":`add_onu`,"/dashboard/onus/provision":`add_onu`,"/dashboard/onus/pre-config":`add_onu`,"/dashboard/onus/unconfigured":`add_onu`,"/dashboard/onus/wizard/register":`add_onu`,"/dashboard/onus/wizard/provision":`add_onu`,"/dashboard/onus/wizard/preconfig":`add_onu`,"/dashboard/settings/olts":`settings_ip_olts`,"/dashboard/settings/mikrotik":`settings_ip_olts`,"/dashboard/customization":`customization`,"/dashboard/users":`manage_users`,"/dashboard/templates":`manage_templates`,"/dashboard/templates/tr069-profile":`manage_tr069`,"/dashboard/logs":`manage_users`,"/dashboard/settings/alerts":`customization`,"/dashboard/settings/cloudflare":`super_admin`,"/dashboard/settings/update":`super_admin`,"/dashboard/settings/auto-provision":`settings_ip_olts`},yl=[{pattern:/^\/dashboard\/settings\/olts\/\d+\/config$/,perm:`settings_ip_olts`}];function bl({children:e}){let{user:t,loading:n}=F(),{pathname:r}=we();if(n&&!t)return(0,N.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,N.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,N.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,N.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,N.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,N.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})});if(!t)return(0,N.jsx)(Te,{to:`/`,replace:!0});if(t.must_change_password&&r!==`/dashboard/profile`)return(0,N.jsx)(Te,{to:`/dashboard/profile`,replace:!0});let i=vl[r];if(!i){for(let e of yl)if(e.pattern.test(r)){i=e.perm;break}}if(i){if(i===`super_admin`){if(!t.is_super_admin&&!new Set(t.permissions||[]).has(`all_olt`))return(0,N.jsx)(Te,{to:`/dashboard`,replace:!0})}else{let e=new Set(t.permissions||[]);if(!t.is_super_admin&&!e.has(`all_olt`)&&!e.has(i))return(0,N.jsx)(Te,{to:`/dashboard`,replace:!0})}}return(0,N.jsx)(N.Fragment,{children:e})}function xl(){let{fetchUser:e,user:t}=F();return(0,j.useEffect)(()=>{t&&(t.theme&&zt.getState().set(t.theme,{persist:!1}),t.language&&Ze.changeLanguage(t.language))},[t]),(0,j.useEffect)(()=>{let t=window.location.pathname||`/`;t!==`/`&&t!==`/login`?e():F.setState({loading:!1}),fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{e.timezone&&Xe(e.timezone)}).catch(()=>{})},[e]),(0,N.jsx)(Yn,{children:(0,N.jsx)(j.Suspense,{fallback:(0,N.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,N.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,N.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,N.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,N.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,N.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})}),children:(0,N.jsxs)(Ae,{children:[(0,N.jsx)(D,{path:`/`,element:(0,N.jsx)(Te,{to:`/login`,replace:!0})}),(0,N.jsx)(D,{path:`/login`,element:(0,N.jsx)(Hc,{})}),(0,N.jsxs)(D,{path:`/dashboard`,element:(0,N.jsxs)(bl,{children:[(0,N.jsx)(Wn,{}),(0,N.jsx)(Jn,{})]}),children:[(0,N.jsx)(D,{index:!0,element:(0,N.jsx)(Uc,{})}),(0,N.jsx)(D,{path:`onus`,element:(0,N.jsx)(Wc,{})}),(0,N.jsx)(D,{path:`onus/add`,element:(0,N.jsx)(Kc,{})}),(0,N.jsx)(D,{path:`onus/register`,element:(0,N.jsx)(Zc,{})}),(0,N.jsx)(D,{path:`onus/provision`,element:(0,N.jsx)(Qc,{})}),(0,N.jsx)(D,{path:`onus/pre-config`,element:(0,N.jsx)(Qc,{manualMode:!0})}),(0,N.jsx)(D,{path:`onus/unconfigured`,element:(0,N.jsx)(dl,{})}),(0,N.jsx)(D,{path:`onus/wizard/register`,element:(0,N.jsx)(fl,{mode:`register`})}),(0,N.jsx)(D,{path:`onus/wizard/provision`,element:(0,N.jsx)(fl,{mode:`provision`})}),(0,N.jsx)(D,{path:`onus/wizard/preconfig`,element:(0,N.jsx)(fl,{mode:`preconfig`})}),(0,N.jsx)(D,{path:`onus/:id`,element:(0,N.jsx)(Gc,{})}),(0,N.jsx)(D,{path:`all-onus/view-c3-r/gpon/:oltId/:frame/:slot/:onuNum`,element:(0,N.jsx)(Gc,{})}),(0,N.jsx)(D,{path:`settings/olts`,element:(0,N.jsx)(qc,{})}),(0,N.jsx)(D,{path:`settings/mikrotik`,element:(0,N.jsx)(Jc,{})}),(0,N.jsx)(D,{path:`settings/olts/:oltId/config`,element:(0,N.jsx)($c,{})}),(0,N.jsx)(D,{path:`customization`,element:(0,N.jsx)(Xc,{})}),(0,N.jsx)(D,{path:`users`,element:(0,N.jsx)(Yc,{})}),(0,N.jsx)(D,{path:`profile`,element:(0,N.jsx)(el,{})}),(0,N.jsx)(D,{path:`settings/alerts`,element:(0,N.jsx)(tl,{})}),(0,N.jsx)(D,{path:`settings/cloudflare`,element:(0,N.jsx)(ll,{})}),(0,N.jsx)(D,{path:`settings/ai`,element:(0,N.jsx)(cl,{})}),(0,N.jsx)(D,{path:`settings/auto-provision`,element:(0,N.jsx)(hl,{})}),(0,N.jsx)(D,{path:`alerts/history`,element:(0,N.jsx)(ol,{})}),(0,N.jsx)(D,{path:`ftth`,element:(0,N.jsx)(nl,{})}),(0,N.jsx)(D,{path:`templates`,element:(0,N.jsx)(rl,{})}),(0,N.jsx)(D,{path:`templates/tr069-profile`,element:(0,N.jsx)(il,{})}),(0,N.jsx)(D,{path:`traffic`,element:(0,N.jsx)(sl,{})}),(0,N.jsx)(D,{path:`logs`,element:(0,N.jsx)(al,{})}),(0,N.jsx)(D,{path:`reports`,element:(0,N.jsx)(gl,{})}),(0,N.jsx)(D,{path:`terminal`,element:(0,N.jsx)(_l,{})}),(0,N.jsx)(D,{path:`guide`,element:(0,N.jsx)(ul,{})}),(0,N.jsx)(D,{path:`settings/update`,element:(0,N.jsx)(pl,{})}),(0,N.jsx)(D,{path:`olt-logs`,element:(0,N.jsx)(ml,{})})]}),(0,N.jsx)(D,{path:`*`,element:(0,N.jsx)(Te,{to:`/`,replace:!0})})]})})})}var Sl=`true`,Cl=`false`,wl=Sl===`true`,Tl=Cl===`true`;function El(e={}){let{immediate:t=!1,onNeedReload:n,onNeedRefresh:r,onOfflineReady:i,onRegistered:a,onRegisteredSW:o,onRegisterError:s}=e,c,l,u,d=async(e=!0)=>{await l,wl||u?.()};async function f(){if(`serviceWorker`in navigator){if(c=await E(async()=>{let{Workbox:e}=await import(`./workbox-window.prod.es5-Bd17z0YL.js`);return{Workbox:e}},[]).then(({Workbox:e})=>new e(`/sw.js`,{scope:`/`,type:`classic`})).catch(e=>{s?.(e)}),!c)return;if(u=()=>{c?.messageSkipWaiting()},!Tl){if(wl)c.addEventListener(`activated`,e=>{(e.isUpdate||e.isExternal)&&(n?n():window.location.reload())}),c.addEventListener(`installed`,e=>{e.isUpdate||i?.()});else{let e=!1,t=()=>{e=!0,c?.addEventListener(`controlling`,e=>{e.isUpdate&&(n?n():window.location.reload())}),r?.()};c.addEventListener(`installed`,n=>{n.isUpdate===void 0?n.isExternal===void 0?!e&&i?.():n.isExternal?t():!e&&i?.():n.isUpdate||i?.()}),c.addEventListener(`waiting`,t)}}c.register({immediate:t}).then(e=>{o?o(`/sw.js`,e):a?.(e)}).catch(e=>{s?.(e)})}}return l=f(),d}var Dl=El({immediate:!0,onNeedRefresh(){Dl(!0)}});Bt();var Ol=new ot({defaultOptions:{queries:{retry:1,staleTime:1e4,refetchOnWindowFocus:!1}}});(0,Ct.createRoot)(document.getElementById(`root`)).render((0,N.jsx)(j.StrictMode,{children:(0,N.jsx)(je,{children:(0,N.jsxs)(Ye,{client:Ol,children:[(0,N.jsx)(xl,{}),(0,N.jsx)(kt,{}),(0,N.jsx)(Mt,{})]})})}));export{P as C,jt as S,yt as T,rn as _,Tn as a,zt as b,gn as c,fn as d,un as f,on as g,sn as h,En as i,mn as l,cn as m,jn as n,xn as o,ln as p,An as r,bn as s,Mn as t,pn as u,nn as v,M as w,F as x,Yt as y};