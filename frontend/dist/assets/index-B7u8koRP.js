const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Dashboard-Dsjk0Q9D.js","assets/rolldown-runtime-hePW80VL.js","assets/vendor-icons-C1eObqHE.js","assets/vendor-react-C9KG3JiN.js","assets/vendor-query-C7wgDwLr.js","assets/utils-CBsBFuyE.js","assets/i18nInstance-DuAUdJZQ.js","assets/api-DNqNBLml.js","assets/PageContainer-75HPZG_w.js","assets/PageHeader-Cj9_tYE9.js","assets/Breadcrumb-DzNlO5yp.js","assets/shared-CNnePRpB.js","assets/useHasPerm-YAlwdXBN.js","assets/useStatusFlash-Bv4HswJ4.js","assets/OltDeviceArt-DBrFZ9GE.js","assets/SnmpOverview-Dydde4wX.js","assets/AllOnus-DFKo-oAv.js","assets/ftthTree-wH5JBsVx.js","assets/LocationPicker-BkW6HQze.js","assets/ViewOnu-CiLpR_cK.js","assets/AreaChart-DW87bV79.js","assets/YAxis-CgVUbGZF.js","assets/AddOnu-C73dKWfy.js","assets/OltSettings-D_-ElkZi.js","assets/MikrotikSettings-DZVvyY3x.js","assets/Devices-DTPHghdr.js","assets/IpOrigin-Dz4r_1-z.js","assets/UserManagement-BQZPcmTE.js","assets/Customization-DuJNWfDh.js","assets/RegisterWizard-Gs-jS_cq.js","assets/PortMapEditor-t2xx6vCq.js","assets/ProvisionWizard-A_ED0Rv7.js","assets/OltConfiguration-j44_7_Y8.js","assets/MyProfile-BWn7YThR.js","assets/PushDeviceCard-Cb3AY2R5.js","assets/AlertSettings-3_MHXsZL.js","assets/FtthInfrastructure-DHkjywEu.js","assets/Templates-BiEINh1o.js","assets/Tr069Profile-DG3Lcdsw.js","assets/ActionLogs-S_3XVjan.js","assets/DeviceDetail-Cu5POVaR.js","assets/Incidents-Dke0lEhN.js","assets/IncidentDetail-CIEQlzq8.js","assets/AlertHistory-Cr28lPcC.js","assets/Traffic-xmL8xPsL.js","assets/AiAgentSettings-hOFbQ-MP.js","assets/CloudflareTunnel-CyqMWF4w.js","assets/GuidePage-bRFbTAha.js","assets/UnconfiguredOnus-k3gJ7H8Q.js","assets/OnuWizard-BAaZGTGF.js","assets/SystemUpdate-Dt5m5ho6.js","assets/OltLogs-B9PBcnjb.js","assets/AutoProvision-Bpti0akj.js","assets/Reports-BC5iaI1j.js","assets/Terminal-uYraaCKe.js","assets/Terminal-TdnZ7DQy.css"])))=>i.map(i=>d[i]);
import{r as e,t}from"./rolldown-runtime-hePW80VL.js";import{$n as n,B as r,Bn as i,Bt as a,Cn as o,Ct as s,Dt as c,F as l,G as u,Hn as d,J as f,Jn as p,Kn as m,Mn as h,Mt as g,Nn as _,On as v,Pn as y,Pt as b,Qn as x,R as S,Rn as C,S as ee,Un as te,Ut as ne,V as re,X as ie,Z as w,a as ae,b as oe,dt as T,f as se,fn as ce,gt as le,j as ue,k as de,kn as fe,m as pe,mt as me,n as E,nt as he,on as ge,qt as _e,s as ve,sn as ye,t as be,un as xe,wn as Se,xn as Ce,yt as we,zt as Te}from"./vendor-icons-C1eObqHE.js";import{a as Ee,c as De,f as D,i as Oe,l as ke,m as Ae,n as je,o as O,p as Me,r as Ne,s as Pe,t as Fe}from"./vendor-react-C9KG3JiN.js";import{S as Ie,_ as Le,a as Re,b as ze,c as Be,d as Ve,f as He,g as k,h as Ue,i as We,l as Ge,m as Ke,n as qe,o as Je,r as Ye,s as A,t as Xe,u as Ze,v as Qe,x as $e,y as et}from"./vendor-query-C7wgDwLr.js";import{i as tt,s as nt,t as j}from"./utils-CBsBFuyE.js";import{r as rt,t as it}from"./i18nInstance-DuAUdJZQ.js";import{n as at,t as ot}from"./api-DNqNBLml.js";import{t as st}from"./vendor-state-fvc2XJy4.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var ct=class extends Ge{#e;#t;#n;constructor(e={}){super(),this.config=e,this.#e=new Set,this.#t=new Map,this.#n=0}build(e,t,n){let r=new We({client:e,mutationCache:this,mutationId:++this.#n,options:e.defaultMutationOptions(t),state:n});return this.add(r),r}add(e){this.#e.add(e);let t=lt(e);if(typeof t==`string`){let n=this.#t.get(t);n?n.push(e):this.#t.set(t,[e])}this.notify({type:`added`,mutation:e})}remove(e){if(this.#e.delete(e)){let t=lt(e);if(typeof t==`string`){let n=this.#t.get(t);if(n){if(n.length>1){let t=n.indexOf(e);t!==-1&&n.splice(t,1)}else n[0]===e&&this.#t.delete(t)}}}this.notify({type:`removed`,mutation:e})}canRun(e){let t=lt(e);if(typeof t==`string`){let n=this.#t.get(t)?.find(e=>e.state.status===`pending`);return!n||n===e}return!0}runNext(e){let t=lt(e);return typeof t==`string`?(this.#t.get(t)?.find(t=>t!==e&&t.state.isPaused))?.continue()??Promise.resolve():Promise.resolve()}clear(){A.batch(()=>{this.#e.forEach(e=>{this.notify({type:`removed`,mutation:e})}),this.#e.clear(),this.#t.clear()})}getAll(){return Array.from(this.#e)}find(e){let t={exact:!0,...e};return this.getAll().find(e=>Ke(t,e))}findAll(e={}){return this.getAll().filter(t=>Ke(e,t))}notify(e){A.batch(()=>{this.listeners.forEach(t=>{t(e)})})}resumePausedMutations(){let e=this.getAll().filter(e=>e.state.isPaused);return A.batch(()=>Promise.all(e.map(e=>e.continue().catch(k))))}};function lt(e){return e.options.scope?.id}var ut=class extends Ge{#e;constructor(e={}){super(),this.config=e,this.#e=new Map}build(e,t,n){let r=t.queryKey,i=t.queryHash??He(r,t),a=this.get(i);return a||(a=new Re({client:e,queryKey:r,queryHash:i,options:e.defaultQueryOptions(t),state:n,defaultOptions:e.getQueryDefaults(r)}),this.add(a)),a}add(e){this.#e.has(e.queryHash)||(this.#e.set(e.queryHash,e),this.notify({type:`added`,query:e}))}remove(e){let t=this.#e.get(e.queryHash);t&&(e.destroy(),t===e&&this.#e.delete(e.queryHash),this.notify({type:`removed`,query:e}))}clear(){A.batch(()=>{this.getAll().forEach(e=>{this.remove(e)})})}get(e){return this.#e.get(e)}getAll(){return[...this.#e.values()]}find(e){let t={exact:!0,...e};return this.getAll().find(e=>Ue(t,e))}findAll(e={}){let t=this.getAll();return Object.keys(e).length>0?t.filter(t=>Ue(e,t)):t}notify(e){A.batch(()=>{this.listeners.forEach(t=>{t(e)})})}onFocus(){A.batch(()=>{this.getAll().forEach(e=>{e.onFocus()})})}onOnline(){A.batch(()=>{this.getAll().forEach(e=>{e.onOnline()})})}},dt=class{#e;#t;#n;#r;#i;#a;#o;#s;constructor(e={}){this.#e=e.queryCache||new ut,this.#t=e.mutationCache||new ct,this.#n=e.defaultOptions||{},this.#r=new Map,this.#i=new Map,this.#a=0}mount(){this.#a++,this.#a===1&&(this.#o=Be.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onFocus())}),this.#s=Je.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onOnline())}))}unmount(){this.#a--,this.#a===0&&(this.#o?.(),this.#o=void 0,this.#s?.(),this.#s=void 0)}isFetching(e){return this.#e.findAll({...e,fetchStatus:`fetching`}).length}isMutating(e){return this.#t.findAll({...e,status:`pending`}).length}getQueryData(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state.data}ensureQueryData(e){let t=this.defaultQueryOptions(e),n=this.#e.build(this,t),r=n.state.data;return r===void 0?this.fetchQuery(e):(e.revalidateIfStale&&n.isStaleByTime(Qe(t.staleTime,n))&&this.prefetchQuery(t),Promise.resolve(r))}getQueriesData(e){return this.#e.findAll(e).map(({queryKey:e,state:t})=>[e,t.data])}setQueryData(e,t,n){let r=this.defaultQueryOptions({queryKey:e}),i=this.#e.get(r.queryHash)?.state.data,a=Ze(t,i);if(a!==void 0)return this.#e.build(this,r).setData(a,{...n,manual:!0})}setQueriesData(e,t,n){return A.batch(()=>this.#e.findAll(e).map(({queryKey:e})=>[e,this.setQueryData(e,t,n)]))}getQueryState(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state}removeQueries(e){let t=this.#e;A.batch(()=>{t.findAll(e).forEach(e=>{t.remove(e)})})}resetQueries(e,t){let n=this.#e;return A.batch(()=>{let r=n.findAll(e),i=new Set(r);return r.forEach(e=>{e.reset()}),this.refetchQueries({type:`active`,predicate:e=>i.has(e)},t)})}cancelQueries(e,t={}){let n={revert:!0,...t},r=A.batch(()=>this.#e.findAll(e).map(e=>e.cancel(n)));return Promise.all(r).then(k).catch(k)}invalidateQueries(e,t={}){return A.batch(()=>(this.#e.findAll(e).forEach(e=>{e.invalidate()}),e?.refetchType===`none`?Promise.resolve():this.refetchQueries({...e,type:e?.refetchType??e?.type??`active`},t)))}refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=A.batch(()=>this.#e.findAll(e).filter(e=>!e.isDisabled()&&!e.isStatic()).map(e=>{let t=e.fetch(void 0,n);return n.throwOnError||(t=t.catch(k)),e.state.fetchStatus===`paused`?Promise.resolve():t}));return Promise.all(r).then(k)}async query(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t),r=n.isStaleByTime(Qe(t.staleTime,n))?await n.fetch(t):n.state.data,i=t.select;return i?i(r):r}fetchQuery(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t);return n.isStaleByTime(Qe(t.staleTime,n))?n.fetch(t):Promise.resolve(n.state.data)}prefetchQuery(e){return this.fetchQuery(e).then(k).catch(k)}infiniteQuery(e){return e._type=`infinite`,this.query(e)}fetchInfiniteQuery(e){return e._type=`infinite`,this.fetchQuery(e)}prefetchInfiniteQuery(e){return this.fetchInfiniteQuery(e).then(k).catch(k)}ensureInfiniteQueryData(e){return e._type=`infinite`,this.ensureQueryData(e)}resumePausedMutations(){return Je.isOnline()?this.#t.resumePausedMutations():Promise.resolve()}getQueryCache(){return this.#e}getMutationCache(){return this.#t}getDefaultOptions(){return this.#n}setDefaultOptions(e){this.#n=e}setQueryDefaults(e,t){this.#r.set(Ve(e),{queryKey:e,defaultOptions:t})}getQueryDefaults(e){let t=[...this.#r.values()],n={};return t.forEach(t=>{Le(e,t.queryKey)&&Object.assign(n,t.defaultOptions)}),n}setMutationDefaults(e,t){this.#i.set(Ve(e),{mutationKey:e,defaultOptions:t})}getMutationDefaults(e){let t=[...this.#i.values()],n={};return t.forEach(t=>{Le(e,t.mutationKey)&&Object.assign(n,t.defaultOptions)}),n}defaultQueryOptions(e){if(e._defaulted)return e;let t={...this.#n.queries,...this.getQueryDefaults(e.queryKey),...e,_defaulted:!0};return t.queryHash||=He(t.queryKey,t),t.refetchOnReconnect===void 0&&(t.refetchOnReconnect=t.networkMode!==`always`),t.throwOnError===void 0&&(t.throwOnError=!!t.suspense),!t.networkMode&&t.persister&&(t.networkMode=`offlineFirst`),t.queryFn===et&&(t.enabled=!1),t}defaultMutationOptions(e){return e?._defaulted?e:{...this.#n.mutations,...e?.mutationKey&&this.getMutationDefaults(e.mutationKey),...e,_defaulted:!0}}clear(){this.#e.clear(),this.#t.clear()}},ft=(e,t,n,r)=>{let i=[n,{code:t,...r||{}}];if(e?.services?.logger?.forward)return e.services.logger.forward(i,`warn`,`react-i18next::`,!0);yt(i[0])&&(i[0]=`react-i18next:: ${i[0]}`),e?.services?.logger?.warn?e.services.logger.warn(...i):console?.warn&&console.warn(...i)},pt={},mt=(e,t,n,r)=>{yt(n)&&pt[n]||(yt(n)&&(pt[n]=new Date),ft(e,t,n,r))},ht=(e,t)=>()=>{if(e.isInitialized)t();else{let n=()=>{setTimeout(()=>{e.off(`initialized`,n)},0),t()};e.on(`initialized`,n)}},gt=(e,t,n)=>{e.loadNamespaces(t,ht(e,n))},_t=(e,t,n,r)=>{if(yt(n)&&(n=[n]),e.options.preload&&e.options.preload.indexOf(t)>-1)return gt(e,n,r);n.forEach(t=>{e.options.ns.indexOf(t)<0&&e.options.ns.push(t)}),e.loadLanguages(t,ht(e,r))},vt=(e,t,n={})=>!t.languages||!t.languages.length?(mt(t,`NO_LANGUAGES`,`i18n.languages were undefined or empty`,{languages:t.languages}),!0):t.hasLoadedNamespace(e,{lng:n.lng,precheck:(t,r)=>{if(n.bindI18n&&n.bindI18n.indexOf(`languageChanging`)>-1&&t.services.backendConnector.backend&&t.isLanguageChangingTo&&!r(t.isLanguageChangingTo,e))return!1}}),yt=e=>typeof e==`string`,bt=e=>typeof e==`object`&&!!e,M=e(n()),xt=(0,M.createContext)(),St=class{constructor(){this.usedNamespaces={}}addUsedNamespaces(e){e.forEach(e=>{this.usedNamespaces[e]||(this.usedNamespaces[e]=!0)})}getUsedNamespaces(){return Object.keys(this.usedNamespaces)}},Ct=t((e=>{var t=n();function r(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var i=typeof Object.is==`function`?Object.is:r,a=t.useState,o=t.useEffect,s=t.useLayoutEffect,c=t.useDebugValue;function l(e,t){var n=t(),r=a({inst:{value:n,getSnapshot:t}}),i=r[0].inst,l=r[1];return s(function(){i.value=n,i.getSnapshot=t,u(i)&&l({inst:i})},[e,n,t]),o(function(){return u(i)&&l({inst:i}),e(function(){u(i)&&l({inst:i})})},[e]),c(n),n}function u(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!i(e,n)}catch{return!0}}function d(e,t){return t()}var f=typeof window>`u`||window.document===void 0||window.document.createElement===void 0?d:l;e.useSyncExternalStore=t.useSyncExternalStore===void 0?f:t.useSyncExternalStore})),wt=t(((e,t)=>{t.exports=Ct()})),Tt=wt(),Et={t:(e,t)=>{if(yt(t))return t;if(bt(t)&&yt(t.defaultValue))return t.defaultValue;if(typeof e==`function`)return``;if(Array.isArray(e)){let t=e[e.length-1];return typeof t==`function`?``:t}return e},ready:!1},Dt=()=>()=>{},N=(e,t={})=>{let{i18n:n}=t,{i18n:r,defaultNS:i}=(0,M.useContext)(xt)||{},a=n||r||it();a&&!a.reportNamespaces&&(a.reportNamespaces=new St),a||mt(a,`NO_I18NEXT_INSTANCE`,`useTranslation: You will need to pass in an i18next instance by using initReactI18next`);let o=(0,M.useMemo)(()=>({...rt(),...a?.options?.react,...t}),[a,t]),{useSuspense:s,keyPrefix:c}=o,l=e||i||a?.options?.defaultNS,u=yt(l)?[l]:l||[`translation`],d=(0,M.useMemo)(()=>u,u);a?.reportNamespaces?.addUsedNamespaces?.(d);let f=(0,M.useRef)(0),p=(0,M.useCallback)(e=>{if(!a)return Dt;let{bindI18n:t,bindI18nStore:n}=o,r=()=>{f.current+=1,e()};return t&&a.on(t,r),n&&a.store.on(n,r),()=>{t&&t.split(` `).forEach(e=>a.off(e,r)),n&&n.split(` `).forEach(e=>a.store.off(e,r))}},[a,o]),m=(0,M.useRef)(),h=(0,M.useCallback)(()=>{if(!a)return Et;let e=!!(a.isInitialized||a.initializedStoreOnce)&&d.every(e=>vt(e,a,o)),n=t.lng||a.language,r=f.current,i=m.current;if(i&&i.ready===e&&i.lng===n&&i.keyPrefix===c&&i.revision===r)return i;let s={t:a.getFixedT(n,o.nsMode===`fallback`?d:d[0],c),ready:e,lng:n,keyPrefix:c,revision:r};return m.current=s,s},[a,d,c,o,t.lng]),[g,_]=(0,M.useState)(0),{t:v,ready:y}=(0,Tt.useSyncExternalStore)(p,h,h);(0,M.useEffect)(()=>{if(a&&!y&&!s){let e=()=>_(e=>e+1);t.lng?_t(a,t.lng,d,e):gt(a,d,e)}},[a,t.lng,d,y,s,g]);let b=a||{},x=(0,M.useRef)(null),S=(0,M.useRef)(),C=e=>{let t=Object.getOwnPropertyDescriptors(e);t.__original&&delete t.__original;let n=Object.create(Object.getPrototypeOf(e),t);if(!Object.prototype.hasOwnProperty.call(n,`__original`))try{Object.defineProperty(n,"__original",{value:e,writable:!1,enumerable:!1,configurable:!1})}catch{}return n},ee=(0,M.useMemo)(()=>{let e=b,t=e?.language,n=e;e&&(x.current&&x.current.__original===e&&S.current===t?n=x.current:(n=C(e),x.current=n,S.current=t));let r=!y&&!s?(...e)=>(mt(a,`USE_T_BEFORE_READY`,`useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t.`),v(...e)):v,i=[r,n,y];return i.t=r,i.i18n=n,i.ready=y,i},[v,b,y,b.resolvedLanguage,b.language,b.languages]);if(a&&s&&!y)throw new Promise(e=>{let n=()=>e();t.lng?_t(a,t.lng,d,n):gt(a,d,n)});return ee},Ot=Me(),P=Ie(),kt=4e3,At=4,jt=null;function F(e,t=`info`,n=kt){jt?.({type:t,message:e,duration:n})}F.success=e=>F(e,`success`),F.error=e=>F(e,`error`,5e3),F.warning=e=>F(e,`warning`),F.info=e=>F(e,`info`);var Mt={success:(0,P.jsx)(Se,{size:18,className:`text-success`}),error:(0,P.jsx)(Ce,{size:18,className:`text-danger`}),warning:(0,P.jsx)(se,{size:18,className:`text-warning`}),info:(0,P.jsx)(a,{size:18,className:`text-accent`})},Nt={success:`border-success/40 [background:color-mix(in_srgb,var(--color-success)_14%,var(--bg-surface))]`,error:`border-danger/40 [background:color-mix(in_srgb,var(--color-danger)_14%,var(--bg-surface))]`,warning:`border-warning/40 [background:color-mix(in_srgb,var(--color-warning)_14%,var(--bg-surface))]`,info:`border-accent/40 [background:color-mix(in_srgb,var(--color-accent)_14%,var(--bg-surface))]`};function Pt(){let[e,t]=(0,M.useState)([]),n=(0,M.useRef)({}),r=(0,M.useCallback)(e=>{t(t=>t.map(t=>t.id===e?{...t,exiting:!0}:t)),setTimeout(()=>{t(t=>t.filter(t=>t.id!==e)),delete n.current[e]},250)},[]),i=(0,M.useCallback)(e=>{t(t=>{if(t.find(t=>t.type===e.type&&t.message===e.message&&!t.exiting))return t;let i=`${e.type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,a=e.duration||kt;n.current[i]=setTimeout(()=>r(i),a);let o=[...t,{...e,id:i}];return o.length<=At?o:(o.slice(0,o.length-At).forEach(e=>{clearTimeout(n.current[e.id]),delete n.current[e.id]}),o.slice(o.length-At))})},[r]);return(0,M.useEffect)(()=>(jt=i,()=>{jt=null}),[i]),(0,M.useEffect)(()=>()=>{Object.values(n.current).forEach(clearTimeout)},[]),(0,P.jsx)(`div`,{className:`fixed top-20 left-4 right-4 sm:left-auto sm:w-full max-w-sm z-[9999] flex flex-col gap-2 pointer-events-none`,children:e.map(e=>(0,P.jsxs)(`div`,{className:j(`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border`,`shadow-lg transition-all duration-250`,Nt[e.type],e.exiting?`opacity-0 translate-x-4`:`animate-slide-in opacity-100`),children:[(0,P.jsx)(`span`,{className:`flex-shrink-0`,children:Mt[e.type]}),(0,P.jsx)(`span`,{className:`text-sm font-medium flex-1 min-w-0 text-tx1 break-words [overflow-wrap:anywhere]`,children:e.message}),(0,P.jsx)(`button`,{onClick:()=>r(e.id),className:`flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`,children:(0,P.jsx)(E,{size:14})})]},e.id))})}var Ft=null;function It(e){return Ft?Ft(e):Promise.resolve(window.confirm(e.message))}function Lt(){let{t:e}=N(),[t,n]=(0,M.useState)(!1),[r,i]=(0,M.useState)({title:``,message:``}),[o,s]=(0,M.useState)(null),c=(0,M.useRef)(null);(0,M.useEffect)(()=>(Ft=e=>(i(e),n(!0),new Promise(e=>s(()=>e))),()=>{Ft=null}),[]);let l=e=>{n(!1),o?.(e)};if((0,M.useEffect)(()=>{if(!t)return;c.current?.focus();let e=e=>{e.key===`Escape`&&l(!1)};return document.addEventListener(`keydown`,e),()=>document.removeEventListener(`keydown`,e)},[t]),!t)return null;let u=r.variant||`default`,d=u===`danger`?`bg-danger hover:bg-danger/85 text-white`:u===`warning`?`bg-warning hover:bg-warning/85 text-black`:`bg-accent hover:bg-accent-hover text-white`;return(0,P.jsxs)(`div`,{className:`fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-4`,children:[(0,P.jsx)(`div`,{className:`modal-overlay`,onClick:()=>l(!1)}),(0,P.jsxs)(`div`,{role:`alertdialog`,"aria-modal":`true`,"aria-labelledby":`confirm-title`,"aria-describedby":`confirm-msg`,className:`relative glass-card w-full max-w-md p-5 sm:p-6 animate-fade-in`,children:[(0,P.jsx)(`button`,{onClick:()=>l(!1),"aria-label":e(`common.close`),className:`absolute top-3 right-3 p-1.5 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass`,children:(0,P.jsx)(E,{size:18})}),(0,P.jsxs)(`div`,{className:`flex items-start gap-3 pr-8`,children:[(0,P.jsx)(`div`,{className:j(`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`,u===`danger`?`bg-danger/15 text-danger`:u===`warning`?`bg-warning/15 text-warning`:`bg-accent/15 text-accent`),children:u==="default"?(0,P.jsx)(a,{size:20}):(0,P.jsx)(se,{size:20})}),(0,P.jsx)(`h3`,{id:`confirm-title`,className:`text-base sm:text-lg font-semibold leading-snug text-tx1 pt-2 break-words`,children:r.title})]}),(0,P.jsx)(`p`,{id:`confirm-msg`,className:`mt-3 text-sm leading-relaxed text-tx2 whitespace-pre-line break-words max-h-[50vh] overflow-y-auto`,children:r.message}),(0,P.jsxs)(`div`,{className:`mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3`,children:[(0,P.jsx)(`button`,{onClick:()=>l(!1),className:`px-4 py-2.5 sm:py-2 rounded-xl text-sm font-medium border border-brd hover:bg-glass transition-colors sm:min-w-24`,children:r.cancelLabel||e(`common.cancel`)}),(0,P.jsx)(`button`,{ref:c,onClick:()=>l(!0),className:j(`px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold transition-colors sm:min-w-24`,d),children:r.confirmLabel||e(`common.confirm`)})]})]})]})}var I=st(e=>({user:null,loading:!0,error:null,fetchUser:async()=>{try{e({loading:!0,error:null});let t=()=>Promise.race([at.me(),new Promise((e,t)=>setTimeout(()=>t(Error(`timeout`)),15e3))]),n;try{n=await t()}catch(e){if(e.message!==`timeout`)throw e;n=await t()}e({user:n.user,loading:!1})}catch{e({user:null,loading:!1})}},login:async(t,n)=>{try{e({error:null,errorCode:void 0,errorData:void 0});let{user:r}=await at.login(t,n);return e({user:r}),!0}catch(t){return e({error:t instanceof Error?t.message:`Login failed`,errorCode:t instanceof ot?t.errorCode:void 0,errorData:t instanceof ot?t.data:void 0}),!1}},logout:async()=>{e({user:null}),at.logout().catch(()=>{})}})),Rt=`theme`,zt=[`dark`,`light`,`system`],Bt=()=>window.matchMedia(`(prefers-color-scheme: light)`);function Vt(e){return e===`system`?Bt().matches?`light`:`dark`:e}function Ht(e,t=!1){let n=document.documentElement,r=()=>n.classList.toggle(`light`,e===`light`),i=n.classList.contains(`light`)!==(e===`light`),a=document,o=window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;if(!t||!i||o||!a.startViewTransition){r();return}n.classList.add(`theme-switching`);let s=()=>n.classList.remove(`theme-switching`);a.startViewTransition(r).finished.then(s,s)}function Ut(e){I.getState().user&&fetch(`/api/profile`,{method:`POST`,headers:{"Content-Type":`application/json`},credentials:`include`,body:JSON.stringify({theme:e})}).catch(()=>{})}var Wt=st((e,t)=>({theme:`dark`,resolved:`dark`,set:(t,n)=>{zt.includes(t)||(t=`system`);let r=Vt(t);Ht(r,!0),localStorage.setItem(Rt,t),e({theme:t,resolved:r}),n?.persist!==!1&&Ut(t)},toggle:()=>{let e=t().resolved===`light`?`dark`:`light`;t().set(e)}}));function Gt(){let e=localStorage.getItem(Rt),t=e&&zt.includes(e)?e:`system`,n=Vt(t);Ht(n),Wt.setState({theme:t,resolved:n}),Bt().addEventListener(`change`,()=>{let{theme:e}=Wt.getState();if(e!==`system`)return;let t=Vt(`system`);Ht(t,!0),Wt.setState({resolved:t})})}function Kt(){let e=qe({predicate:e=>e.state.data===void 0&&e.state.fetchStatus===`fetching`}),{pathname:t}=De(),[n,r]=(0,M.useState)(`idle`),i=(0,M.useRef)([]),a=(0,M.useRef)(!1),o=()=>{i.current.forEach(clearTimeout),i.current=[]};return(0,M.useEffect)(()=>{if(!a.current){a.current=!0;return}o(),r(`run`),i.current.push(window.setTimeout(()=>r(`done`),280)),i.current.push(window.setTimeout(()=>r(`idle`),700))},[t]),(0,M.useEffect)(()=>{e>0?(o(),i.current.push(window.setTimeout(()=>r(`run`),150))):r(e=>e===`run`?(o(),i.current.push(window.setTimeout(()=>r(`idle`),420)),`done`):e)},[e]),(0,M.useEffect)(()=>o,[]),(0,P.jsx)(`div`,{className:`top-progress`,"data-phase":n,"aria-hidden":`true`})}function qt(e,t){let n=(0,M.useRef)(null),[r,i]=(0,M.useState)(null),a=(0,M.useRef)(!1);(0,M.useLayoutEffect)(()=>{let t=n.current;if(!t)return;let r=()=>{let n=t.querySelector(e);if(!n||n.offsetWidth===0){i(null);return}i({x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight})};r();let a=typeof ResizeObserver<`u`?new ResizeObserver(r):null;return a?.observe(t),t.querySelectorAll(`:scope > *`).forEach(e=>a?.observe(e)),window.addEventListener(`resize`,r),()=>{a?.disconnect(),window.removeEventListener(`resize`,r)}},t);let o=!a.current&&r!==null;return r&&(a.current=!0),{ref:n,style:r?{width:r.w,height:r.h,transform:`translate3d(${r.x}px, ${r.y}px, 0)`,opacity:1,transition:o?`none`:void 0}:{opacity:0},ready:r!==null}}var Jt=[{section:`nav.secMonitor`,labelKey:`nav.dashboard`,icon:(0,P.jsx)(b,{size:20}),path:`/dashboard`,permission:`view_dashboard`},{section:`nav.secMonitor`,labelKey:`nav.incidents`,icon:(0,P.jsx)(ue,{size:20}),path:`/dashboard/incidents`,permission:`view_dashboard`},{section:`nav.secMonitor`,labelKey:`nav.devices`,icon:(0,P.jsx)(u,{size:20}),path:`/dashboard/devices`,permission:`view_dashboard`},{section:`nav.secMonitor`,labelKey:`nav.traffic`,icon:(0,P.jsx)(x,{size:20}),path:`/dashboard/traffic`,permission:`view_dashboard`},{section:`nav.secMonitor`,labelKey:`nav.reports`,icon:(0,P.jsx)(y,{size:20}),path:`/dashboard/reports`,permission:`view_onus`},{section:`nav.secNetwork`,labelKey:`nav.onu`,icon:(0,P.jsx)(w,{size:20}),permission:`view_dashboard`,children:[{labelKey:`nav.allOnus`,path:`/dashboard/onus`},{labelKey:`nav.unconfigured`,path:`/dashboard/onus/unconfigured`,permission:`add_onu`},{labelKey:`nav.provision`,path:`/dashboard/onus/provision`,permission:`add_onu`},{labelKey:`nav.preconfig`,path:`/dashboard/onus/pre-config`,permission:`add_onu`},{labelKey:`nav.registerWizard`,path:`/dashboard/onus/register`,permission:`add_onu`}]},{section:`nav.secNetwork`,labelKey:`nav.infrastructure`,icon:(0,P.jsx)(S,{size:20}),permission:`view_dashboard`,children:[{labelKey:`nav.ftthOverview`,path:`/dashboard/ftth`,permission:`view_dashboard`},{labelKey:`nav.ftthMap`,path:`/dashboard/ftth?tab=map`,permission:`view_dashboard`},{labelKey:`nav.oltSettings`,path:`/dashboard/settings/olts`,permission:`settings_ip_olts`},{labelKey:`nav.mikrotik`,path:`/dashboard/settings/mikrotik`,permission:`settings_ip_olts`},{labelKey:`nav.autoProvision`,path:`/dashboard/settings/auto-provision`,permission:`settings_ip_olts`}]},{section:`nav.secNetwork`,labelKey:`nav.templates`,icon:(0,P.jsx)(g,{size:20}),permission:`manage_templates`,children:[{labelKey:`nav.onuTemplates`,path:`/dashboard/templates`,permission:`manage_templates`},{labelKey:`nav.tr069Profile`,path:`/dashboard/templates/tr069-profile`,permission:`manage_tr069`}]},{section:`nav.secTools`,labelKey:`nav.terminal`,icon:(0,P.jsx)(oe,{size:20}),path:`/dashboard/terminal`,permission:`olt_terminal`},{section:`nav.secTools`,labelKey:`nav.oltLogs`,icon:(0,P.jsx)(le,{size:20}),path:`/dashboard/olt-logs`,permission:`view_dashboard`},{section:`nav.secTools`,labelKey:`nav.alertHistory`,icon:(0,P.jsx)(f,{size:20}),path:`/dashboard/alerts/history`,permission:`view_dashboard`},{section:`nav.secTools`,labelKey:`nav.activityLog`,icon:(0,P.jsx)(re,{size:20}),path:`/dashboard/logs`,permission:`manage_users`},{section:`nav.secSettings`,labelKey:`nav.system`,icon:(0,P.jsx)(de,{size:20}),permission:void 0,children:[{labelKey:`nav.alertSettings`,path:`/dashboard/settings/alerts`,permission:`customization`},{labelKey:`nav.users`,path:`/dashboard/users`,permission:`manage_users`},{labelKey:`nav.customization`,path:`/dashboard/customization`,permission:`customization`},{labelKey:`nav.aiAgent`,path:`/dashboard/settings/ai`,permission:`super_admin`},{labelKey:`nav.cloudflare`,path:`/dashboard/settings/cloudflare`,permission:`super_admin`},{labelKey:`nav.systemUpdate`,path:`/dashboard/settings/update`,permission:`super_admin`}]},{section:`nav.secSettings`,labelKey:`nav.guide`,icon:(0,P.jsx)(i,{size:20}),path:`/dashboard/guide`}];function Yt(e){if(!e)return[];let t=new Set(e.permissions||[]),n=n=>!n||e.is_super_admin?!0:n===`super_admin`?t.has(`all_olt`):t.has(`all_olt`)?!0:t.has(n),r=Jt.map(e=>({...e,children:e.children?.map(e=>({...e}))}));return r=r.filter(e=>n(e.permission)?!e.children||e.children.some(e=>n(e.permission)):!1),r}function Xt({collapsed:e,mobileOpen:t,onToggle:n,onMobileClose:r}){let{t:i}=N(),{user:a}=I(),o=ke(),s=a?.sidebar_name||`Salfanet NMS`,c=new Set(a?.permissions||[]),l=e=>!e||a?.is_super_admin?!0:e===`super_admin`?c.has(`all_olt`):c.has(`all_olt`)?!0:c.has(e),u=Yt(a),d=De(),f=(e,t)=>{let[n,r]=e.split(`?`);if(d.pathname!==n)return!1;let i=new URLSearchParams(d.search);return r?[...new URLSearchParams(r).entries()].every(([e,t])=>i.get(e)===t):!t.some(t=>t!==e&&t.split(`?`)[0]===n&&t.includes(`?`)&&f(t,[]))},[p,m]=(0,M.useState)(()=>{let e={},t=window.location.pathname;for(let n of u)n.children?.some(e=>t.startsWith(e.path.split(`?`)[0]))&&(e[n.labelKey]=!0);return e}),g=e=>{m(t=>({...t,[e]:!t[e]}))},_=t||!e,y=qt(`a[aria-current="page"]`,[d.pathname,d.search,_,JSON.stringify(p)]);return(0,P.jsxs)(P.Fragment,{children:[t&&(0,P.jsx)(`div`,{className:`fixed inset-0 bg-black/50 z-40 lg:hidden`,onClick:r}),(0,P.jsxs)(`aside`,{className:j(`sidebar-panel fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out`,`bg-surface border-r border-brd`,e?`lg:w-[70px]`:`lg:w-[260px]`,`w-[260px]`,t?`sidebar-open`:`sidebar-closed`),children:[(0,P.jsxs)(`div`,{className:j(`flex items-center h-16 px-4 border-b border-brd`,_?`justify-between`:`justify-center`),children:[_?(0,P.jsxs)(`div`,{className:`flex items-center gap-2.5 min-w-0`,children:[(0,P.jsx)(`div`,{className:j(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,P.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,P.jsx)(be,{size:18,className:`text-white`})}),(0,P.jsx)(`span`,{className:`text-lg font-bold tracking-tight truncate`,children:s})]}):(0,P.jsx)(`div`,{className:j(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,P.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,P.jsx)(be,{size:18,className:`text-white`})}),_&&(0,P.jsx)(`button`,{onClick:n,className:`p-1.5 rounded-lg hover:bg-glass transition-colors max-lg:hidden flex-shrink-0`,children:(0,P.jsx)(fe,{size:18})}),_&&(0,P.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass transition-colors lg:hidden flex-shrink-0`,children:(0,P.jsx)(E,{size:18})})]}),!_&&(0,P.jsx)(`button`,{onClick:n,className:`hidden lg:flex items-center justify-center w-full py-2 text-tx3 hover:text-tx1 hover:bg-glass transition-colors border-b border-brd`,children:(0,P.jsx)(v,{size:18})}),(0,P.jsxs)(`nav`,{ref:y.ref,className:`relative flex-1 overflow-y-auto py-4 px-3`,children:[(0,P.jsx)(`span`,{className:`slide-ind nav-ind`,style:y.style,"aria-hidden":`true`}),u.map((e,t)=>(0,P.jsxs)(`div`,{className:`mb-1`,children:[e.section&&e.section!==u[t-1]?.section&&(_?(0,P.jsx)(`div`,{className:j(`px-3 pb-1.5 text-[11px] font-semibold text-tx3`,t>0&&`pt-3`),children:i(e.section)}):t>0&&(0,P.jsx)(`div`,{className:`mx-2 my-2 border-t border-brd`,"aria-hidden":`true`})),e.path?(0,P.jsxs)(Ne,{to:e.path,end:e.path===`/dashboard`,onClick:r,title:_?void 0:i(e.labelKey),className:({isActive:e})=>j(`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,e?`bg-accent/15 text-accent border border-accent/20`:`text-tx2 hover:text-tx1 hover:bg-glass`,!_&&`justify-center px-2`),children:[e.icon,_&&(0,P.jsx)(`span`,{children:i(e.labelKey)})]}):(0,P.jsxs)(P.Fragment,{children:[(0,P.jsxs)(`button`,{onClick:()=>{let t=e.children?.filter(e=>l(e.permission))||[];!_&&t.length?(o(t[0].path),r()):g(e.labelKey)},title:_?void 0:i(e.labelKey),className:j(`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,`text-tx2 hover:text-tx1 hover:bg-glass`,!_&&`justify-center px-2`),children:[e.icon,_&&(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`span`,{className:`flex-1 text-left`,children:i(e.labelKey)}),p[e.labelKey]?(0,P.jsx)(h,{size:16}):(0,P.jsx)(v,{size:16})]})]}),_&&p[e.labelKey]&&e.children&&(0,P.jsx)(`div`,{className:`ml-4 mt-1 space-y-0.5 animate-fade-in`,children:e.children.filter(e=>l(e.permission)).map((e,t,n)=>{let a=f(e.path,n.map(e=>e.path));return(0,P.jsxs)(je,{to:e.path,onClick:r,"aria-current":a?`page`:void 0,className:j(`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all`,a?`bg-accent/10 text-accent`:`text-tx3 hover:text-tx2 hover:bg-glass`),children:[(0,P.jsx)(`div`,{className:`w-1.5 h-1.5 rounded-full bg-current opacity-50`}),(0,P.jsx)(`span`,{children:i(e.labelKey)})]},e.path)})})]})]},e.labelKey))]}),_&&(0,P.jsxs)(`div`,{className:`px-4 py-3 border-t border-brd space-y-2`,children:[(0,P.jsxs)(`a`,{href:`https://saweria.co/salfanetradius`,target:`_blank`,rel:`noopener noreferrer`,className:`flex items-center gap-2 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors`,children:[(0,P.jsx)(ne,{size:13,className:`fill-current`}),(0,P.jsx)(`span`,{children:`Dukung Project — Saweria`})]}),(0,P.jsxs)(`div`,{className:`text-xs text-tx3`,children:[s,` v2.0`]})]})]})]})}var Zt=e(Ae(),1),Qt={baseUrl:``,reconnect:!0,maxRetries:10,pingInterval:3e4};function $t(e,t={}){let n={...Qt,...t},[r,i]=(0,M.useState)(null),[a,o]=(0,M.useState)(!1),[s,c]=(0,M.useState)(!1),l=(0,M.useRef)(null),u=(0,M.useRef)(0),d=(0,M.useRef)(null),f=(0,M.useRef)(null),p=(0,M.useRef)(!0),m=(0,M.useRef)(0),h=(0,M.useCallback)(()=>{if(n.baseUrl)return`${n.baseUrl}${e}`;let t=window.location.protocol===`https:`?`wss:`:`ws:`,r=window.location.hostname,i=window.location.port;return i===``||i===`80`||i===`443`?`${t}//${r}${e}`:`${t}//${r}:${window.__WS_PORT__||`8765`}${e}`},[e,n.baseUrl]),g=(0,M.useCallback)(async()=>{try{let e=await fetch(`/api/ws-token`,{credentials:`include`});if(e.ok)return(await e.json()).token||null}catch{}return null},[]),_=(0,M.useCallback)(()=>{d.current&&=(clearInterval(d.current),null),f.current&&=(clearTimeout(f.current),null),l.current&&=(l.current.onclose=null,l.current.close(),null)},[]),v=(0,M.useCallback)(async()=>{if(!p.current)return;let e=l.current;if(e&&e.readyState===WebSocket.CONNECTING)return;_();let t=++m.current,r=await g();if(!p.current||!r||t!==m.current)return;let a=h(),s=`${a}${a.includes(`?`)?`&`:`?`}token=${encodeURIComponent(r)}`,y=new WebSocket(s);l.current=y;let b=setTimeout(()=>{y.readyState===WebSocket.CONNECTING&&y.close()},1e4);y.addEventListener(`open`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`error`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`close`,()=>clearTimeout(b),{once:!0}),y.onopen=()=>{p.current&&(o(!0),c(!1),u.current=0,d.current=setInterval(()=>{y.readyState===WebSocket.OPEN&&y.send(`ping`)},n.pingInterval))},y.onmessage=e=>{if(p.current)try{let t=JSON.parse(e.data);if(t.event===`server_ping`){y.readyState===WebSocket.OPEN&&y.send(`pong`);return}t.event!==`pong`&&i(t)}catch{}},y.onclose=()=>{if(p.current&&(o(!1),d.current&&=(clearInterval(d.current),null),n.reconnect&&u.current<n.maxRetries)){c(!0);let e=Math.min(1e3*2**u.current,3e4);u.current+=1,f.current=setTimeout(()=>{p.current&&v()},e)}},y.onerror=()=>{}},[h,_,g,n.reconnect,n.maxRetries,n.pingInterval]);return(0,M.useEffect)(()=>(p.current=!0,v(),()=>{p.current=!1,_()}),[v,_]),{lastMessage:r,isConnected:a,isReconnecting:s,send:(0,M.useCallback)(e=>{l.current?.readyState===WebSocket.OPEN&&l.current.send(e)},[]),disconnect:(0,M.useCallback)(()=>{p.current=!1,_(),o(!1),c(!1)},[_])}}var en=(0,M.createContext)(null);function tn({children:e}){let{lastMessage:t}=$t(`/ws/dashboard`,{reconnect:!0});return(0,P.jsx)(en.Provider,{value:t,children:e})}function nn(){return(0,M.useContext)(en)}var rn={critical:{icon:(0,P.jsx)(se,{size:14,className:`text-danger`}),color:`text-danger`},warning:{icon:(0,P.jsx)(se,{size:14,className:`text-warning`}),color:`text-warning`},info:{icon:(0,P.jsx)(_,{size:14,className:`text-info`}),color:`text-info`}},an={alarm:{icon:l,labelKey:`topbar.alarms`,badgeClass:`bg-danger`,iconActiveClass:`text-danger`,headerClass:`text-danger`},unregister:{icon:he,labelKey:`topbar.unregOnus`,badgeClass:`bg-warning`,iconActiveClass:`text-warning`,headerClass:`text-warning`},general:{icon:d,labelKey:`topbar.notifications`,badgeClass:`bg-accent`,iconActiveClass:`text-accent`,headerClass:`text-accent`}};function on({type:e,notifs:t,unregData:n,onClose:r,onNavigate:i}){let{t:a}=N(),s=$e(),c=an[e].icon,l=Xe({mutationFn:async e=>fetch(`/api/notifications/${e}/read`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),u=Xe({mutationFn:async()=>fetch(`/api/notifications/read-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),d=Xe({mutationFn:async e=>fetch(`/api/notifications/${e}/acknowledge`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),f=Xe({mutationFn:async()=>fetch(`/api/notifications/acknowledge-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),p=Xe({mutationFn:async()=>fetch(`/api/notifications/clear`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>s.invalidateQueries({queryKey:[`notifications`]})}),h=t.filter(e=>!e.is_read&&!e.resolved).length,g=t.filter(e=>!e.resolved),v=t.filter(e=>e.resolved),y={offline:`offline`,offline_batch:`offline`,dyinggasp:`dyinggasp`,dyinggasp_batch:`dyinggasp`,los:`los`,los_batch:`los`,signal:`los`,signal_drop:`los`,signal_drop_batch:`los`},b=t=>{if(t.is_read||l.mutate(t.id),t.incident_id){r(),i(`/dashboard/incidents/${t.incident_id}`);return}if(e===`alarm`){let e=y[t.category];e&&(r(),i(`/dashboard/onus?filter=${e}`))}else e===`unregister`&&(r(),i(`/dashboard/onus/register`))};return(0,P.jsxs)(`div`,{className:`fixed md:absolute left-2 right-2 md:left-auto md:right-0 top-14 md:top-12 w-auto md:w-96 max-h-[80vh] md:max-h-[75vh] rounded-2xl z-50 animate-fade-in overflow-hidden flex flex-col shadow-2xl shadow-black/40 border border-brd`,style:{background:`var(--bg-surface)`},children:[(0,P.jsxs)(`div`,{className:`flex items-center justify-between px-4 py-3 border-b border-brd`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,P.jsx)(c,{size:16,className:an[e].headerClass}),(0,P.jsx)(`span`,{className:`font-semibold text-sm`,children:a(an[e].labelKey)}),h>0&&(0,P.jsx)(`span`,{className:j(`px-2 py-0.5 rounded-full text-[10px] font-bold text-white`,an[e].badgeClass),children:h})]}),(0,P.jsxs)(`div`,{className:`flex gap-1`,children:[h>0&&(0,P.jsx)(`button`,{onClick:()=>f.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-success transition-colors`,title:a(`topbar.ackAll`),children:(0,P.jsx)(o,{size:14})}),h>0&&(0,P.jsx)(`button`,{onClick:()=>u.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors`,title:a(`topbar.markAllRead`),children:(0,P.jsx)(_,{size:14})}),(0,P.jsx)(`button`,{onClick:()=>p.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-danger transition-colors`,title:a(`topbar.clearRead`),children:(0,P.jsx)(pe,{size:14})}),(0,P.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1 transition-colors`,title:a(`common.close`),children:(0,P.jsx)(E,{size:14})})]})]}),e===`unregister`&&n&&n.unregistered>0&&(0,P.jsxs)(`div`,{onClick:()=>{r(),i(`/dashboard/onus/register`)},className:`px-4 py-3 bg-warning/10 border-b border-warning/20 cursor-pointer hover:bg-warning/15 transition-colors group`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,P.jsx)(`div`,{className:`w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0`,children:(0,P.jsx)(he,{size:16,className:`text-warning`})}),(0,P.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,P.jsx)(`div`,{className:`text-sm font-medium text-warning`,children:a(`topbar.unregCta`,{count:n.unregistered})}),(0,P.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5`,children:a(`topbar.tapToRegister`)})]}),(0,P.jsx)(m,{size:16,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]}),n.breakdown.slice(0,3).map((e,t)=>(0,P.jsxs)(`div`,{className:`text-xs text-tx3 mt-1.5 pl-10`,children:[e.olt_name,`: `,e.count,` ONU(s)`]},t))]}),e===`alarm`&&n&&n.offline_dyinggasp>0&&(0,P.jsxs)(`div`,{className:`border-b border-brd/50`,children:[n.dyinggasp_count>0&&(0,P.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=dyinggasp`)},className:`px-4 py-2.5 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors group`,children:(0,P.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,P.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0`,children:(0,P.jsx)(se,{size:14,className:`text-warning`})}),(0,P.jsx)(`div`,{className:`flex-1`,children:(0,P.jsx)(`span`,{className:`text-xs font-medium text-warning`,children:a(`topbar.onuDyinggasp`,{count:n.dyinggasp_count})})}),(0,P.jsx)(m,{size:14,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]})}),n.offline_count>0&&(0,P.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=offline`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,P.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,P.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,P.jsx)(ae,{size:14,className:`text-danger`})}),(0,P.jsx)(`div`,{className:`flex-1`,children:(0,P.jsx)(`span`,{className:`text-xs font-medium text-danger`,children:a(`topbar.onuOffline`,{count:n.offline_count})})}),(0,P.jsx)(m,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})}),n.los_count>0&&(0,P.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=los`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,P.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,P.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,P.jsx)(Ce,{size:14,className:`text-danger`})}),(0,P.jsx)(`div`,{className:`flex-1`,children:(0,P.jsx)(`span`,{className:`text-xs font-medium text-danger`,children:a(`topbar.onuLos`,{count:n.los_count})})}),(0,P.jsx)(m,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})})]}),(0,P.jsx)(`div`,{className:`overflow-y-auto flex-1 max-h-[55vh] md:max-h-[50vh] overscroll-contain`,children:g.length===0&&v.length===0?(0,P.jsxs)(`div`,{className:`py-10 text-center`,children:[(0,P.jsx)(c,{size:28,className:`text-tx3/40 mx-auto mb-2`}),(0,P.jsx)(`p`,{className:`text-tx3 text-sm`,children:a(e===`alarm`?`topbar.noAlarms`:e===`unregister`?`topbar.noUnreg`:`topbar.noNotif`)})]}):(0,P.jsxs)(P.Fragment,{children:[g.map(e=>{let t=rn[e.severity||`info`]||rn.info,n=e.acknowledged;return(0,P.jsx)(`div`,{onClick:()=>b(e),className:j(`px-4 py-3 border-b border-brd/50 cursor-pointer hover:bg-glass/50 transition-colors group`,!e.is_read&&`bg-accent/5`,n&&`opacity-60`),children:(0,P.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,P.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:t.icon}),(0,P.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,P.jsx)(`span`,{className:`text-sm font-medium truncate`,children:e.title}),n&&(0,P.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,P.jsx)(o,{size:9}),` ACK`]})]}),(0,P.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-2`,children:e.message.split(`
`)[0]}),(0,P.jsxs)(`div`,{className:`text-[10px] text-tx3/70 mt-1 flex items-center gap-2`,children:[(0,P.jsx)(`span`,{children:e.created_at?new Date(e.created_at).toLocaleString():``}),n&&e.acknowledged_by&&(0,P.jsxs)(`span`,{className:`text-success/70`,children:[`by `,e.acknowledged_by]})]})]}),(0,P.jsxs)(`div`,{className:`flex flex-col items-center gap-1 flex-shrink-0`,children:[!e.is_read&&(0,P.jsx)(`div`,{className:`w-2 h-2 rounded-full bg-accent animate-pulse`}),!n&&(0,P.jsx)(`button`,{onClick:t=>{t.stopPropagation(),d.mutate(e.id)},className:`p-1 rounded hover:bg-success/15 text-tx3 hover:text-success transition-colors opacity-0 group-hover:opacity-100`,title:a(`topbar.acknowledge`),children:(0,P.jsx)(o,{size:14})})]})]})},e.id)}),v.length>0&&(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`div`,{className:`px-4 py-1.5 bg-glass/30 border-b border-brd/50 text-[10px] font-medium text-tx3 uppercase tracking-wide`,children:a(`topbar.resolved`,{count:v.length})}),v.map(e=>(0,P.jsx)(`div`,{onClick:()=>b(e),className:`px-4 py-2.5 border-b border-brd/50 cursor-pointer hover:bg-glass/30 transition-colors opacity-50`,children:(0,P.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,P.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:(0,P.jsx)(o,{size:14,className:`text-success`})}),(0,P.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,P.jsx)(`span`,{className:`text-sm font-medium truncate line-through`,children:e.title}),(0,P.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,P.jsx)(o,{size:9}),` RESOLVED`]})]}),(0,P.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-1`,children:e.message.split(`
`)[0]}),(0,P.jsx)(`div`,{className:`text-[10px] text-tx3/70 mt-1`,children:e.resolved_at?a(`topbar.resolvedAt`,{time:new Date(e.resolved_at).toLocaleString()}):``})]})]})},e.id))]})]})})]})}function sn({onMenuClick:e}){let{t}=N(),{user:n,logout:r}=I(),{resolved:i,toggle:a}=Wt(),[o,c]=(0,M.useState)(!1),[l,u]=(0,M.useState)(null),f=$e(),p=ke(),m=(0,M.useRef)(null),h=(0,M.useRef)(null),g=(0,M.useRef)(null),{data:_}=Ye({queryKey:[`notifications`],queryFn:async()=>{let e=await fetch(`/api/notifications?limit=50`,{credentials:`include`});return e.ok?e.json():{notifications:[],unread_count:0,alarm_unread:0,unregister_unread:0,general_unread:0}},refetchInterval:1e4}),v=nn();(0,M.useEffect)(()=>{v&&(v.event===`alert`||v.event===`onu_change`)&&(f.invalidateQueries({queryKey:[`notifications`]}),f.invalidateQueries({queryKey:[`unregistered-count`]}))},[v,f]);let{data:y}=Ye({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),b=_?.notifications||[],x=_?.alarm_unread||0,S=_?.unregister_unread||0,C=_?.general_unread||0,te=S+(y?.unregistered||0),ne=(0,M.useMemo)(()=>b.filter(e=>e.type===`alarm`),[b]),re=(0,M.useMemo)(()=>b.filter(e=>e.type===`unregister`),[b]),ie=(0,M.useMemo)(()=>b.filter(e=>e.type===`general`),[b]);(0,M.useEffect)(()=>{let e=e=>{m.current&&!m.current.contains(e.target)&&u(null),h.current&&!h.current.contains(e.target)&&!g.current?.contains(e.target)&&c(!1)};return document.addEventListener(`mousedown`,e),()=>document.removeEventListener(`mousedown`,e)},[]);let w=e=>{p(e)},ae=(e,n,r)=>{let i=an[e],a=i.icon,o=l===e;return(0,P.jsxs)(`button`,{onClick:()=>u(o?null:e),className:j(`relative p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,o&&`bg-glass`,r),title:t(i.labelKey),"aria-label":t(i.labelKey),children:[(0,P.jsx)(a,{size:18,className:j(`text-tx2 transition-colors`,o&&i.iconActiveClass)}),n>0&&(0,P.jsx)(`div`,{className:j(`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse-once`,i.badgeClass),children:n>99?`99+`:n})]},e)};return(0,P.jsxs)(`header`,{className:`sticky top-0 z-30 h-14 md:h-16 flex items-center justify-between px-3 md:px-6 bg-surface border-b border-brd transition-colors duration-300`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-2 min-w-0`,children:[(0,P.jsx)(`button`,{onClick:e,className:`p-2 rounded-lg hover:bg-glass transition-colors lg:hidden active:scale-95`,children:(0,P.jsx)(we,{size:20,className:`text-tx2`})}),(0,P.jsxs)(`div`,{className:`flex items-center gap-1.5 lg:hidden min-w-0`,children:[(0,P.jsx)(`div`,{className:j(`w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-accent/20 overflow-hidden`,n?.logo_url?`bg-white p-1`:`bg-accent`),children:n?.logo_url?(0,P.jsx)(`img`,{src:n.logo_url,alt:``,className:`w-full h-full object-contain`}):(0,P.jsx)(be,{size:15,className:`text-white`})}),(0,P.jsx)(`span`,{className:`hidden min-[360px]:inline text-sm font-bold tracking-tight truncate`,children:n?.sidebar_name||`Salfanet NMS`})]})]}),(0,P.jsxs)(`div`,{className:`flex items-center gap-1`,children:[(0,P.jsx)(`button`,{onClick:a,className:`inline-flex p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,title:t(i===`light`?`topbar.themeToDark`:`topbar.themeToLight`),"aria-label":t(i===`light`?`topbar.themeToDark`:`topbar.themeToLight`),children:i===`light`?(0,P.jsx)(me,{size:18,className:`text-tx2`}):(0,P.jsx)(ee,{size:18,className:`text-tx2`})}),(0,P.jsxs)(`div`,{className:`relative flex items-center gap-0.5`,ref:m,children:[ae(`alarm`,x),ae(`unregister`,te),ae(`general`,C,`hidden sm:block`),l===`alarm`&&(0,P.jsx)(on,{type:`alarm`,notifs:ne,unregData:y,onClose:()=>u(null),onNavigate:w}),l===`unregister`&&(0,P.jsx)(on,{type:`unregister`,notifs:re,unregData:y,onClose:()=>u(null),onNavigate:w}),l===`general`&&(0,P.jsx)(on,{type:`general`,notifs:ie,unregData:y,onClose:()=>u(null),onNavigate:w})]}),(0,P.jsxs)(`div`,{className:`relative`,ref:h,children:[(0,P.jsxs)(`button`,{onClick:()=>c(!o),className:`flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-glass transition-colors active:scale-95`,children:[(0,P.jsx)(`div`,{className:`w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center ring-1 ring-accent/20`,children:(0,P.jsx)(ve,{size:16,className:`text-accent`})}),(0,P.jsxs)(`div`,{className:`text-left hidden sm:block`,children:[(0,P.jsx)(`div`,{className:`text-sm font-medium leading-tight`,children:n?.full_name||`Admin`}),(0,P.jsx)(`div`,{className:`text-[10px] text-tx3 leading-tight`,children:n?.is_super_admin&&(!n?.role||n.role===`User`)?t(`topbar.superAdmin`):n?.role||`User`})]})]}),o&&(0,Zt.createPortal)((0,P.jsxs)(`div`,{ref:g,style:{position:`fixed`},className:`top-14 right-2 w-52 max-w-[calc(100vw-1rem)] py-1.5 glass-card surface-solid rounded-xl z-[999] animate-fade-in shadow-2xl shadow-black/20`,children:[(0,P.jsxs)(`div`,{className:`px-4 py-2.5 border-b border-brd`,children:[(0,P.jsx)(`div`,{className:`text-sm font-medium`,children:n?.full_name||`Admin`}),(0,P.jsx)(`div`,{className:`text-xs text-tx3`,children:n?.username||``}),n?.is_super_admin&&(0,P.jsx)(`div`,{className:`text-[10px] text-accent font-medium mt-0.5`,children:t(`topbar.superAdmin`)})]}),(0,P.jsxs)(`button`,{onClick:()=>{c(!1),p(`/dashboard/profile`)},className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,P.jsx)(ve,{size:16,className:`text-tx3`}),` `,t(`topbar.myProfile`)]}),(0,P.jsxs)(`button`,{onClick:()=>{c(!1),u(`general`)},className:`sm:hidden flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,P.jsx)(d,{size:16,className:`text-tx3`}),(0,P.jsx)(`span`,{className:`flex-1 text-left`,children:t(`topbar.notifications`)}),C>0&&(0,P.jsx)(`span`,{className:`px-1.5 min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center`,children:C>99?`99+`:C})]}),(0,P.jsx)(`hr`,{className:`border-brd my-1`}),(0,P.jsxs)(`button`,{onClick:()=>r(),className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors`,children:[(0,P.jsx)(s,{size:16}),` `,t(`topbar.logout`)]})]}),document.body)]})]})]})}function cn(){let{t:e}=N(),[t,n]=(0,M.useState)(navigator.onLine);return(0,M.useEffect)(()=>{let e=()=>n(!0),t=()=>n(!1);return window.addEventListener(`online`,e),window.addEventListener(`offline`,t),()=>{window.removeEventListener(`online`,e),window.removeEventListener(`offline`,t)}},[]),t?null:(0,P.jsxs)(`div`,{className:`fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black text-xs font-medium text-center py-1 flex items-center justify-center gap-1.5`,children:[(0,P.jsx)(ae,{size:13}),(0,P.jsx)(`span`,{children:e(`cmp_off.connectionLostDataCan`)})]})}var ln={sm:`max-w-md`,md:`max-w-lg`,lg:`max-w-2xl`,xl:`max-w-4xl`};function un({open:e,onClose:t,title:n,icon:r,children:i,size:a=`md`,footer:o}){return(0,M.useEffect)(()=>{if(!e)return;let n=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,n),()=>document.removeEventListener(`keydown`,n)},[e,t]),e?(0,Zt.createPortal)((0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`div`,{className:`modal-overlay`,onClick:t}),(0,P.jsx)(`div`,{className:`modal-wrapper`,children:(0,P.jsxs)(`div`,{className:j(`relative glass-card w-full flex flex-col rounded-t-2xl md:rounded-2xl`,`max-h-[90dvh] md:max-h-[85dvh] animate-slide-up md:animate-fade-in`,ln[a]),onClick:e=>e.stopPropagation(),children:[n&&(0,P.jsxs)(`div`,{className:`section-header sticky top-0 z-10 rounded-t-2xl`,children:[(0,P.jsxs)(`h2`,{className:`section-title`,children:[r,n]}),(0,P.jsx)(`button`,{onClick:t,className:`text-tx3 hover:text-tx1 transition-colors p-1 rounded-lg hover:bg-glass`,children:(0,P.jsx)(E,{size:18})})]}),(0,P.jsx)(`div`,{className:`overflow-y-auto flex-1 p-4 md:p-5`,children:i}),o&&(0,P.jsx)(`div`,{className:`modal-footer justify-end`,children:o})]})})]}),document.body):null}function dn({title:e,icon:t,action:n,children:r,className:i,bodyClassName:a,onClick:o}){return(0,P.jsxs)(`div`,{className:j(`glass-card`,i),onClick:o,role:o?`button`:void 0,tabIndex:o?0:void 0,onKeyDown:o?e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),o())}:void 0,children:[e&&(0,P.jsxs)(`div`,{className:`section-header`,children:[(0,P.jsxs)(`h3`,{className:`section-title`,children:[t,e]}),n]}),(0,P.jsx)(`div`,{className:j(`p-4 md:p-5`,a),children:r})]})}function fn({variant:e=`neutral`,children:t,className:n}){return(0,P.jsx)(`span`,{className:j(`badge`,`badge-${e}`,n),children:t})}function pn({size:e=`md`,className:t}){return(0,P.jsx)(`div`,{className:j(`spinner`,e===`lg`&&`spinner-lg`,e===`sm`&&`spinner-sm`,t)})}function mn({label:e}){return(0,P.jsxs)(`div`,{className:`flex flex-col items-center justify-center py-12`,children:[(0,P.jsx)(c,{size:28,className:`text-accent animate-spin`}),e&&(0,P.jsx)(`p`,{className:`text-tx3 text-sm mt-3`,children:e})]})}function hn({icon:e,title:t,description:n,action:r}){return(0,P.jsxs)(`div`,{className:`empty-state`,children:[e&&(0,P.jsx)(`div`,{className:`empty-state-icon`,children:(0,P.jsx)(e,{size:22})}),(0,P.jsx)(`p`,{className:`empty-state-title`,children:t}),n&&(0,P.jsx)(`p`,{className:`empty-state-desc`,children:n}),r&&(0,P.jsx)(`div`,{className:`mt-4`,children:r})]})}function gn({children:e,className:t,maxHeight:n=`max-h-64`}){return(0,P.jsx)(`div`,{className:j(`code-block`,n,`overflow-y-auto`,t),children:(0,P.jsx)(`pre`,{children:e})})}var _n={2:`grid-cols-2`,3:`grid-cols-3`,4:`grid-cols-4`};function vn({tabs:e,active:t,onChange:n,className:r,mobileGrid:i}){let a=_n[i===!0?4:i||4],o=qt(`[aria-selected="true"]`,[t,e.length,i]);return(0,P.jsxs)(`div`,{ref:o.ref,role:`tablist`,"data-sliding":o.ready?``:void 0,className:j(`relative gap-1 p-1 rounded-lg bg-glass border border-brd max-w-full`,i?`grid ${a} w-full md:flex md:w-fit md:overflow-x-auto tab-scroll`:`flex w-full sm:w-fit overflow-x-auto tab-scroll`,r),children:[(0,P.jsx)(`span`,{className:`slide-ind tab-ind`,style:o.style,"aria-hidden":`true`}),e.map(e=>(0,P.jsxs)(`button`,{type:`button`,role:`tab`,"aria-selected":t===e.key,onClick:()=>n(e.key),className:j(`tab-btn inline-flex items-center flex-shrink-0`,i?`tab-btn-grid flex-col justify-center gap-1 min-w-0 md:flex-row md:gap-1.5`:`gap-1.5`,t===e.key&&`tab-btn-active`),children:[e.icon,(0,P.jsx)(`span`,{className:j(i&&`max-w-full text-center line-clamp-2 md:line-clamp-none`),children:e.label})]},e.key))]})}function yn({className:e}){return(0,P.jsx)(`div`,{className:j(`skeleton-shimmer rounded-lg`,e)})}var bn={primary:`btn-primary`,secondary:`btn-cancel border border-brd`,ghost:`btn-ghost`,danger:`btn-danger`,warning:`btn-warning`,accent:`btn-accent`,icon:`p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass transition-colors active:scale-95`},xn=(0,M.forwardRef)(function({variant:e=`primary`,loading:t=!1,icon:n,disabled:r,className:i,children:a,type:o=`button`,...s},c){return(0,P.jsxs)(`button`,{ref:c,type:o,disabled:r||t,"aria-busy":t||void 0,className:j(bn[e],`inline-flex items-center justify-center gap-2`,i),...s,children:[t?(0,P.jsx)(pn,{size:`sm`}):n,a]})}),Sn=(0,M.forwardRef)(function({label:e,error:t,helperText:n,icon:r,suffix:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,M.useId)(),d=s||u;return(0,P.jsxs)(`div`,{className:j(`w-full`,o),children:[e&&(0,P.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,P.jsxs)(`div`,{className:`relative`,children:[r&&(0,P.jsx)(`span`,{className:`absolute left-3 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none`,children:r}),(0,P.jsx)(`input`,{ref:l,id:d,className:j(`input-field`,r&&`pl-9`,i&&`pr-10`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c}),i&&(0,P.jsx)(`span`,{className:`absolute right-3 top-1/2 -translate-y-1/2 text-tx3`,children:i})]}),t?(0,P.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,P.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),Cn=(0,M.forwardRef)(function({label:e,error:t,helperText:n,options:r,children:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,M.useId)(),d=s||u;return(0,P.jsxs)(`div`,{className:j(`w-full`,o),children:[e&&(0,P.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,P.jsx)(`select`,{ref:l,id:d,className:j(`input-field`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c,children:r?r.map(e=>(0,P.jsx)(`option`,{value:e.value,disabled:e.disabled,children:e.label},e.value)):i}),t?(0,P.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,P.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),wn=(0,M.forwardRef)(function({label:e,error:t,helperText:n,className:r,wrapperClassName:i,id:a,...o},s){let c=(0,M.useId)(),l=a||c;return(0,P.jsxs)(`div`,{className:j(`w-full`,i),children:[e&&(0,P.jsx)(`label`,{htmlFor:l,className:`label-sm block`,children:e}),(0,P.jsx)(`textarea`,{ref:s,id:l,className:j(`input-field`,`h-auto min-h-[80px] py-2.5`,t&&`border-danger`,r),"aria-invalid":!!t||void 0,"aria-describedby":t?`${l}-error`:n?`${l}-helper`:void 0,...o}),t?(0,P.jsx)(`p`,{id:`${l}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,P.jsx)(`p`,{id:`${l}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),Tn={ok:`var(--status-ok)`,warn:`var(--status-warn)`,crit:`var(--status-crit)`,idle:`var(--status-idle)`,info:`var(--status-info)`};function En({items:e,active:t,onSelect:n,className:r,...i}){return(0,P.jsx)(`div`,{role:n?`toolbar`:`list`,"aria-label":i[`aria-label`],className:j(`scroll-row md:flex-wrap md:overflow-visible -mx-3 px-3 md:mx-0 md:px-0`,r),children:e.map(e=>{let r=e.color||Tn[e.tone||`idle`],i=t===e.key,a=(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`span`,{className:`status-dot`,"aria-hidden":`true`}),e.icon&&(0,P.jsx)(`span`,{className:`opacity-80`,"aria-hidden":`true`,children:e.icon}),(0,P.jsx)(`span`,{children:e.label}),(0,P.jsx)(`span`,{className:`status-chip-count`,children:e.count})]}),o={"--chip-tone":r};return n?(0,P.jsx)(`button`,{type:`button`,className:`status-chip`,"data-active":i,"aria-pressed":i,title:e.title,style:o,onClick:()=>n(e.key),children:a},e.key):(0,P.jsx)(`span`,{role:`listitem`,className:`status-chip`,"data-active":i,title:e.title,style:o,children:a},e.key)})})}function Dn({open:e,onClose:t,title:n,description:r,children:i,footer:a,width:o=420,className:s}){let{t:c}=N(),l=(0,M.useRef)(null);return(0,M.useEffect)(()=>{if(!e)return;let n=document.activeElement,r=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,r),l.current?.focus(),()=>{document.removeEventListener(`keydown`,r),n?.focus?.()}},[e,t]),e?(0,Zt.createPortal)((0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`div`,{className:`sheet-backdrop`,onClick:t,"aria-hidden":`true`}),(0,P.jsxs)(`div`,{ref:l,role:`dialog`,"aria-modal":`true`,"aria-label":typeof n==`string`?n:void 0,tabIndex:-1,className:j(`sheet-panel outline-none`,s),style:{"--sheet-w":`${o}px`},children:[(0,P.jsx)(`div`,{className:`sheet-grip`,"aria-hidden":`true`}),(n||r)&&(0,P.jsxs)(`div`,{className:`flex items-start justify-between gap-3 px-4 pt-3 pb-3 md:px-5 md:pt-5 border-b border-brd`,children:[(0,P.jsxs)(`div`,{className:`min-w-0`,children:[n&&(0,P.jsx)(`h2`,{className:`text-base font-semibold text-tx1 truncate`,children:n}),r&&(0,P.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:r})]}),(0,P.jsx)(`button`,{type:`button`,onClick:t,className:`touch-target -mr-2 -mt-1 p-2 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass flex items-center justify-center`,"aria-label":c(`common.close`),children:(0,P.jsx)(E,{size:18})})]}),(0,P.jsx)(`div`,{className:`flex-1 overflow-y-auto overscroll-contain p-4 md:p-5`,children:i}),a&&(0,P.jsx)(`div`,{className:`border-t border-brd p-3 md:p-4 flex gap-2 justify-end`,children:a})]})]}),document.body):null}function On(e){let[t,n]=(0,M.useState)(()=>typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(e).matches);return(0,M.useEffect)(()=>{if(typeof window.matchMedia!=`function`)return;let t=window.matchMedia(e),r=()=>n(t.matches);return r(),t.addEventListener?.(`change`,r),()=>t.removeEventListener?.(`change`,r)},[e]),t}var kn=()=>!On(`(min-width: 768px)`);function An({actions:e,label:t,title:n,iconOnly:r,className:i}){let{t:a}=N(),o=kn(),[s,c]=(0,M.useState)(!1),l=(0,M.useRef)(null),u=(0,M.useRef)(null),[d,f]=(0,M.useState)(null),p=t||a(`ui.more`),m=e.filter(e=>!e.danger),h=e.filter(e=>e.danger);(0,M.useLayoutEffect)(()=>{if(!s||o||!l.current)return;let e=l.current.getBoundingClientRect();f({top:e.bottom+6,right:Math.max(8,window.innerWidth-e.right)})},[s,o]),(0,M.useEffect)(()=>{if(!s||o)return;let e=e=>{let t=e.target;!u.current?.contains(t)&&!l.current?.contains(t)&&c(!1)},t=e=>{e.key===`Escape`&&c(!1)},n=()=>c(!1);return document.addEventListener(`mousedown`,e),document.addEventListener(`keydown`,t),window.addEventListener(`scroll`,n,!0),window.addEventListener(`resize`,n),()=>{document.removeEventListener(`mousedown`,e),document.removeEventListener(`keydown`,t),window.removeEventListener(`scroll`,n,!0),window.removeEventListener(`resize`,n)}},[s,o]);let g=e=>{e.disabled||(c(!1),e.onClick())},_=(e,t)=>(0,P.jsxs)(`button`,{type:`button`,role:`menuitem`,disabled:e.disabled,onClick:()=>g(e),className:j(`w-full flex items-center gap-3 text-left rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed`,t?`min-h-[48px] px-3 text-[15px]`:`px-3 py-2 text-sm`,e.danger?`text-danger hover:bg-danger/10`:`text-tx1 hover:bg-glass`),children:[e.icon&&(0,P.jsx)(`span`,{className:j(`shrink-0`,e.danger?`text-danger`:`text-tx3`),"aria-hidden":`true`,children:e.icon}),(0,P.jsxs)(`span`,{className:`flex-1 min-w-0`,children:[(0,P.jsx)(`span`,{className:`block truncate`,children:e.label}),e.hint&&(0,P.jsx)(`span`,{className:`block text-xs text-tx3 truncate`,children:e.hint})]})]},e.key),v=e=>(0,P.jsxs)(`div`,{role:`menu`,className:`flex flex-col gap-0.5`,children:[m.map(t=>_(t,e)),h.length>0&&(0,P.jsxs)(P.Fragment,{children:[m.length>0&&(0,P.jsx)(`hr`,{className:`border-brd my-1.5`}),h.map(t=>_(t,e))]})]});return e.length===0?null:(0,P.jsxs)(P.Fragment,{children:[(0,P.jsxs)(`button`,{ref:l,type:`button`,onClick:()=>c(e=>!e),"aria-haspopup":`menu`,"aria-expanded":s,"aria-label":r?p:void 0,title:r?p:void 0,className:j(r?`touch-target p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass inline-flex items-center justify-center`:`btn-cancel border border-brd inline-flex items-center justify-center gap-2`,i),children:[(0,P.jsx)(xe,{size:18,"aria-hidden":`true`}),!r&&(0,P.jsx)(`span`,{children:p})]}),s&&o&&(0,P.jsx)(Dn,{open:!0,onClose:()=>c(!1),title:n||p,children:v(!0)}),s&&!o&&d&&(0,Zt.createPortal)((0,P.jsxs)(`div`,{ref:u,style:{position:`fixed`,top:d.top,right:d.right},className:`z-[70] w-60 max-h-[70vh] overflow-y-auto p-1.5 rounded-xl border border-brd shadow-2xl shadow-black/30 animate-fade-in`,children:[(0,P.jsx)(`div`,{className:`absolute inset-0 -z-10 rounded-xl`,style:{background:`var(--bg-surface)`}}),v(!1)]}),document.body)]})}function jn({steps:e,current:t,onStepClick:n,className:r}){let{t:i}=N(),a=e.length,o=Math.min(Math.max(t,0),a-1),s=a>1?(o+1)/a*100:100;return(0,P.jsxs)(`nav`,{"aria-label":i(`ui.steps`),className:r,children:[(0,P.jsxs)(`div`,{className:`md:hidden`,children:[(0,P.jsxs)(`div`,{className:`flex items-baseline justify-between gap-2 text-sm`,children:[(0,P.jsx)(`span`,{className:`font-semibold text-tx1 truncate`,children:e[o]?.label}),(0,P.jsx)(`span`,{className:`text-xs text-tx3 num shrink-0`,children:i(`ui.stepOf`,{n:o+1,total:a})})]}),(0,P.jsx)(`div`,{className:`mt-2 h-1.5 rounded-full bg-glass overflow-hidden`,role:`progressbar`,"aria-valuemin":1,"aria-valuemax":a,"aria-valuenow":o+1,children:(0,P.jsx)(`div`,{className:`h-full rounded-full bg-accent transition-[width] duration-300`,style:{width:`${s}%`}})})]}),(0,P.jsx)(`ol`,{className:`hidden md:flex items-center gap-2`,children:e.map((e,t)=>{let r=t<o,i=t===o,s=r&&!!n;return(0,P.jsxs)(`li`,{className:`flex items-center gap-2 min-w-0 flex-1 last:flex-none`,children:[(0,P.jsxs)(`button`,{type:`button`,disabled:!s,onClick:()=>s&&n?.(t),"aria-current":i?`step`:void 0,className:j(`flex items-center gap-2 min-w-0 rounded-lg px-1 py-1`,s&&`hover:bg-glass`),children:[(0,P.jsx)(`span`,{className:j(`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold num border`,r&&`bg-accent text-white border-accent`,i&&`border-accent text-accent bg-accent/10`,!r&&!i&&`border-brd text-tx3`),children:r?(0,P.jsx)(_,{size:14}):t+1}),(0,P.jsx)(`span`,{className:j(`text-sm truncate`,i?`text-tx1 font-semibold`:`text-tx3`),children:e.label})]}),t<a-1&&(0,P.jsx)(`span`,{className:j(`h-px flex-1 min-w-4`,r?`bg-accent`:`bg-brd`),"aria-hidden":`true`})]},t)})})]})}var Mn={info:{icon:(0,P.jsx)(a,{size:18}),cls:`border-accent/30 bg-accent/10 text-accent`},ok:{icon:(0,P.jsx)(o,{size:18}),cls:`border-success/30 bg-success/10 text-success`},warn:{icon:(0,P.jsx)(se,{size:18}),cls:`border-warning/30 bg-warning/10 text-warning`},crit:{icon:(0,P.jsx)(Ce,{size:18}),cls:`border-danger/30 bg-danger/10 text-danger`}},Nn=e=>{try{return localStorage.getItem(`nms-notice:${e}`)===`1`}catch{return!1}},Pn=e=>{try{localStorage.setItem(`nms-notice:${e}`,`1`)}catch{}};function Fn({tone:e=`info`,title:t,children:n,action:r,dismissKey:i,className:a}){let{t:o}=N(),[s,c]=(0,M.useState)(()=>i?Nn(i):!1);if(s)return null;let l=Mn[e];return(0,P.jsxs)(`div`,{role:e===`crit`||e===`warn`?`alert`:`status`,className:j(`flex items-start gap-3 rounded-xl border px-4 py-3`,l.cls,a),children:[(0,P.jsx)(`span`,{className:`shrink-0 mt-0.5`,"aria-hidden":`true`,children:l.icon}),(0,P.jsxs)(`div`,{className:`flex-1 min-w-0 text-sm`,children:[t&&(0,P.jsx)(`p`,{className:`font-medium text-tx1`,children:t}),n&&(0,P.jsx)(`div`,{className:j(`text-tx2`,t&&`mt-0.5`),children:n}),r&&(0,P.jsx)(`div`,{className:`mt-2 flex flex-wrap gap-2`,children:r})]}),i&&(0,P.jsx)(`button`,{type:`button`,onClick:()=>{Pn(i),c(!0)},className:`shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass`,"aria-label":o(`common.close`),children:(0,P.jsx)(E,{size:16})})]})}function In({children:e,className:t}){return(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`div`,{className:`sticky-action-spacer`,"aria-hidden":`true`}),(0,P.jsx)(`div`,{className:j(`sticky-action-bar`,t),children:e})]})}function Ln({updatedAt:e,fetching:t,staleAfter:n=90,className:r}){let{t:i}=N(),[a,o]=(0,M.useState)(()=>Date.now());(0,M.useEffect)(()=>{let e=setInterval(()=>o(Date.now()),1e3);return()=>clearInterval(e)},[]);let s=e?Math.max(0,Math.round((a-e)/1e3)):null,c=s!=null&&s>n,l=s==null?i(`live.waiting`):s<5?i(`live.justNow`):s<60?i(`live.secondsAgo`,{n:s}):i(`live.minutesAgo`,{n:Math.floor(s/60)});return(0,P.jsxs)(`span`,{className:j(`live-pulse`,c&&`is-stale`,t&&`is-fetching`,r),role:`status`,"aria-live":`off`,children:[(0,P.jsx)(`span`,{className:`live-pulse-dot`,"aria-hidden":!0}),(0,P.jsx)(`span`,{className:`live-pulse-label`,children:t?i(`live.updating`):l})]})}function Rn({values:e,height:t=40,className:n,tone:r=`accent`,label:i}){let a=(0,M.useId)().replace(/:/g,``);if(e.length<2)return(0,P.jsx)(`div`,{className:j(`sparkline-empty`,n),style:{height:t}});let o=Math.min(...e),s=Math.max(...e)-o||1,c=e.map((n,r)=>[r/(e.length-1)*240,3+(1-(n-o)/s)*(t-6)]),l=c.map(([e,t],n)=>`${n?`L`:`M`}${e.toFixed(1)},${t.toFixed(1)}`).join(` `),u=`${l} L240,${t} L0,${t} Z`,[d,f]=c[c.length-1];return(0,P.jsxs)(`svg`,{className:j(`sparkline`,`sparkline-${r}`,n),viewBox:`0 0 240 ${t}`,preserveAspectRatio:`none`,role:`img`,"aria-label":i,style:{height:t},children:[(0,P.jsx)(`defs`,{children:(0,P.jsxs)(`linearGradient`,{id:`sg${a}`,x1:`0`,x2:`0`,y1:`0`,y2:`1`,children:[(0,P.jsx)(`stop`,{offset:`0%`,stopColor:`currentColor`,stopOpacity:`0.28`}),(0,P.jsx)(`stop`,{offset:`100%`,stopColor:`currentColor`,stopOpacity:`0`})]})}),(0,P.jsx)(`path`,{d:u,fill:`url(#sg${a})`}),(0,P.jsx)(`path`,{d:l,fill:`none`,stroke:`currentColor`,strokeWidth:`1.75`,vectorEffect:`non-scaling-stroke`,strokeLinejoin:`round`,strokeLinecap:`round`}),(0,P.jsx)(`circle`,{cx:d,cy:f,r:`2.6`,fill:`currentColor`,vectorEffect:`non-scaling-stroke`,className:`sparkline-head`})]})}function zn({beats:e,className:t,label:n}){return(0,P.jsx)(`div`,{className:j(`heartbeat`,t),role:`img`,"aria-label":n,children:e.map((e,t)=>(0,P.jsx)(`span`,{className:`heartbeat-beat`,"data-level":e.level,title:e.title},t))})}function Bn(){let{t:e}=N(),{user:t,fetchUser:n,logout:r}=I(),[i,a]=(0,M.useState)(``),[o,c]=(0,M.useState)(``),[u,d]=(0,M.useState)(``),[f,p]=(0,M.useState)(!1),[m,h]=(0,M.useState)(!1),[g,_]=(0,M.useState)(``);if(!t?.must_change_password)return null;let v=async t=>{if(t.preventDefault(),_(``),o!==u){_(e(`profile.passwordMismatch`));return}h(!0);try{if(!(await at.updateProfile({password:o,current_password:i})).success)throw Error(e(`error.generic`));F.success(e(`profile.updated`)),a(``),c(``),d(``),await n()}catch(t){let n=t instanceof ot?t.errorCode:void 0;_(n?e(`error.${n}`,{defaultValue:t.message}):t.message)}finally{h(!1)}},y=(0,P.jsx)(`button`,{type:`button`,onClick:()=>p(e=>!e),tabIndex:-1,"aria-label":`toggle password visibility`,children:f?(0,P.jsx)(ye,{size:16}):(0,P.jsx)(ge,{size:16})}),b=f?`text`:`password`;return(0,Zt.createPortal)((0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`div`,{className:`modal-overlay`,style:{zIndex:60}}),(0,P.jsx)(`div`,{className:`modal-wrapper`,style:{zIndex:61},role:`dialog`,"aria-modal":`true`,"aria-labelledby":`force-pw-title`,children:(0,P.jsxs)(`form`,{onSubmit:v,className:`relative glass-card w-full max-w-md p-5 md:p-6 rounded-t-2xl md:rounded-2xl animate-fade-in`,children:[(0,P.jsxs)(`div`,{className:`flex items-start gap-3 mb-4`,children:[(0,P.jsx)(`div`,{className:`icon-badge w-10 h-10`,"data-color":`warning`,children:(0,P.jsx)(l,{size:20})}),(0,P.jsxs)(`div`,{children:[(0,P.jsx)(`h2`,{id:`force-pw-title`,className:`section-title`,children:e(`profile.mustChangeTitle`)}),(0,P.jsx)(`p`,{className:`text-sm text-tx3 mt-1`,children:e(`profile.forceMsg`)})]})]}),(0,P.jsxs)(`div`,{className:`space-y-3`,children:[(0,P.jsx)(Sn,{label:e(`profile.currentPassword`),type:b,value:i,autoComplete:`current-password`,onChange:e=>a(e.target.value),suffix:y,autoFocus:!0,required:!0}),(0,P.jsx)(Sn,{label:e(`profile.newPassword`),type:b,value:o,autoComplete:`new-password`,onChange:e=>c(e.target.value),helperText:e(`profile.forceHint`),required:!0}),(0,P.jsx)(Sn,{label:e(`profile.confirmPassword`),type:b,value:u,autoComplete:`new-password`,onChange:e=>d(e.target.value),required:!0})]}),g&&(0,P.jsx)(`p`,{role:`alert`,className:`text-sm text-danger mt-3`,children:g}),(0,P.jsxs)(`div`,{className:`flex items-center justify-between gap-2 mt-5`,children:[(0,P.jsx)(xn,{variant:`ghost`,icon:(0,P.jsx)(s,{size:14}),onClick:()=>r(),children:e(`topbar.logout`)}),(0,P.jsx)(xn,{type:`submit`,loading:m,disabled:!i||!o||!u,children:e(`profile.saveChanges`)})]})]})})]}),document.body)}function Vn(e){let t=`=`.repeat((4-e.length%4)%4),n=atob((e+t).replace(/-/g,`+`).replace(/_/g,`/`));return Uint8Array.from(n,e=>e.charCodeAt(0))}function Hn(){return`serviceWorker`in navigator&&`PushManager`in window&&`Notification`in window}async function Un(){if(!Hn())return`unsupported`;if(Notification.permission===`denied`)return`denied`;try{return await(await navigator.serviceWorker.ready).pushManager.getSubscription()?`subscribed`:`unsubscribed`}catch{return`unsubscribed`}}async function Wn(){if(!Hn()||(Notification.permission===`granted`?`granted`:await Notification.requestPermission())!==`granted`)return!1;let e=await navigator.serviceWorker.ready,{public_key:t}=await at.pushVapidKey(),n=(await e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Vn(t)})).toJSON();return await at.pushSubscribe({endpoint:n.endpoint||``,keys:n.keys||{}}),!0}async function Gn(){let e=await(await navigator.serviceWorker.ready).pushManager.getSubscription();e&&(await at.pushUnsubscribe(e.endpoint),await e.unsubscribe())}var Kn=`nms-push-prompt-dismissed`,qn=7;function Jn(){try{let e=Number(localStorage.getItem(Kn)||0);return e>0&&Date.now()-e<qn*864e5}catch{return!1}}function Yn(){let{t:e}=N(),[t,n]=(0,M.useState)(!1),[r,i]=(0,M.useState)(!1);if((0,M.useEffect)(()=>{if(!Hn())return;let e=!0;return Un().then(async t=>{if(e&&t===`unsubscribed`){if(Notification.permission===`granted`){try{await Wn()}catch{}return}Notification.permission==="default"&&!Jn()&&n(!0)}}),()=>{e=!1}},[]),!t)return null;let a=async()=>{i(!0);try{await Wn()?F.success(e(`cmp_pprompt.problemNotificationsAreOn`)):F.error(e(`cmp_pprompt.notificationPermissionDenied`)),n(!1)}catch(e){F.error(e.message||`Gagal mengaktifkan notifikasi`)}finally{i(!1)}},o=()=>{try{localStorage.setItem(Kn,String(Date.now()))}catch{}n(!1)};return(0,P.jsx)(`div`,{className:`fixed z-[70] left-3 right-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-96`,children:(0,P.jsxs)(`div`,{className:`bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start`,children:[(0,P.jsx)(te,{size:20,className:`text-accent shrink-0 mt-0.5`}),(0,P.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,P.jsx)(`p`,{className:`text-sm font-semibold text-tx1`,children:e(`cmp_pprompt.turnOnProblemNotifications`)}),(0,P.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:e(`cmp_pprompt.getOltOnuAlerts`)}),(0,P.jsxs)(`div`,{className:`flex gap-2 mt-3`,children:[(0,P.jsx)(`button`,{onClick:a,disabled:r,className:`btn-primary text-xs disabled:opacity-50`,children:e(`cmp_pprompt.turnOn`)}),(0,P.jsx)(`button`,{onClick:o,className:`px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1`,children:e(`cmp_pprompt.later`)})]})]}),(0,P.jsx)(`button`,{onClick:o,className:`p-1 text-tx3 hover:text-tx1`,"aria-label":`close`,children:(0,P.jsx)(E,{size:16})})]})})}var Xn=`false`,Zn=`false`,Qn=Xn===`true`,$n=Zn===`true`;function er(e={}){let{immediate:t=!1,onNeedReload:n,onNeedRefresh:r,onOfflineReady:i,onRegistered:a,onRegisteredSW:o,onRegisterError:s}=e,c,l,u,d=async(e=!0)=>{await l,Qn||u?.()};async function f(){if(`serviceWorker`in navigator){if(c=await D(async()=>{let{Workbox:e}=await import(`./workbox-window.prod.es5-Bd17z0YL.js`);return{Workbox:e}},[]).then(({Workbox:e})=>new e(`/sw.js`,{scope:`/`,type:`classic`})).catch(e=>{s?.(e)}),!c)return;if(u=()=>{c?.messageSkipWaiting()},!$n){if(Qn)c.addEventListener(`activated`,e=>{(e.isUpdate||e.isExternal)&&(n?n():window.location.reload())}),c.addEventListener(`installed`,e=>{e.isUpdate||i?.()});else{let e=!1,t=()=>{e=!0,c?.addEventListener(`controlling`,e=>{e.isUpdate&&(n?n():window.location.reload())}),r?.()};c.addEventListener(`installed`,n=>{n.isUpdate===void 0?n.isExternal===void 0?!e&&i?.():n.isExternal?t():!e&&i?.():n.isUpdate||i?.()}),c.addEventListener(`waiting`,t)}}c.register({immediate:t}).then(e=>{o?o(`/sw.js`,e):a?.(e)}).catch(e=>{s?.(e)})}}return l=f(),d}var tr=3e5,nr=2e4,rr=Date.now(),ir=!1,ar=new Set;function or(){wr(),er({immediate:!0,onNeedRefresh(){dr()},onRegisteredSW(e,t){if(!t)return;let n=()=>{navigator.onLine!==!1&&t.update().catch(()=>void 0)};setInterval(n,tr);let r=()=>{Date.now()-rr>nr&&(rr=Date.now(),n())};document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`visible`&&r()}),window.addEventListener(`focus`,r),window.addEventListener(`online`,r)}})}var sr=()=>ir;function cr(){let e=document.querySelector(`script[type="module"][src*="/assets/index-"]`);return e?new URL(e.src,window.location.href).pathname:null}async function lr(){try{let e=await fetch(`/index.html?v=${Date.now()}`,{cache:`no-store`,credentials:`same-origin`});if(!e.ok)return null;let t=(await e.text()).match(/<script[^>]*\ssrc="([^"]*\/assets\/index-[^"]+\.js)"/);return t?new URL(t[1],window.location.href).pathname:null}catch{return null}}async function ur(){let e=cr();if(!e)return null;let t=await lr();return t?t!==e:null}async function dr(){if(await ur()===!1){await fr();return}ir=!0,ar.forEach(e=>e())}async function fr(){try{let e=(await navigator.serviceWorker?.getRegistration())?.waiting;if(!e)return;window.__nmsSilentSwap=!0,e.postMessage({type:`SKIP_WAITING`})}catch{}}function pr(e){return ar.add(e),()=>{ar.delete(e)}}function mr(){return br()}var hr=e=>new Promise(t=>setTimeout(t,e));async function gr(e=9e4){let t=async()=>{try{return(await fetch(`/api/public/branding`,{cache:`no-store`})).ok}catch{return!1}};await hr(2500);let n=Date.now();for(;Date.now()-n<e;){if(await t())return;await hr(1e3)}}function _r(e,t){return new Promise(n=>{if(e.state!==`installing`){n();return}let r=()=>{e.removeEventListener(`statechange`,i),clearTimeout(a),n()},i=()=>{e.state!==`installing`&&r()},a=setTimeout(r,t);e.addEventListener(`statechange`,i)})}function vr(e,t){return Promise.race([e,hr(t).then(()=>void 0)])}function yr(e,t){navigator.serviceWorker.addEventListener(`controllerchange`,t);try{e.postMessage({type:`SKIP_WAITING`})}catch{}setTimeout(t,4e3)}async function br(e={}){let{waitServer:t=!1,onPhase:n}=e,r=e.installWaitMs??(t?45e3:12e3),i=!1,a,o=()=>{i||(i=!0,a&&clearTimeout(a),window.location.reload())};try{let e=`serviceWorker`in navigator?navigator.serviceWorker:null,i=e?await vr(e.getRegistration().catch(()=>void 0),3e3):void 0,s=i?vr(i.update().catch(()=>void 0),1e4):Promise.resolve();if(t&&(n?.(`server`),await gr()),a=setTimeout(o,r+15e3),await s,i&&!i.waiting&&!i.installing&&t&&await vr(i.update().catch(()=>void 0),1e4),i?.installing&&(n?.(`download`),await _r(i.installing,r)),n?.(`reload`),await Cr(),i?.waiting){yr(i.waiting,o);return}o()}catch{o()}}var xr=`nms-sw-attempt`,Sr=`nms-sw-hard`;async function Cr(){try{let e=await vr(lr(),3e3);e&&sessionStorage.setItem(xr,JSON.stringify({target:e,at:Date.now()}))}catch{}}async function wr(){let e=null;try{e=JSON.parse(sessionStorage.getItem(xr)||`null`),sessionStorage.removeItem(xr)}catch{return}if(!e?.target||!e.at||Date.now()-e.at>12e4)return;let t=cr();t&&t!==e.target&&await Tr()}async function Tr(){try{let e=Number(sessionStorage.getItem(Sr)||0);if(Date.now()-e<6e4)return;sessionStorage.setItem(Sr,String(Date.now()))}catch{}try{let e=await navigator.serviceWorker?.getRegistrations?.()||[];await Promise.all(e.map(e=>e.unregister()))}catch{}try{`caches`in window&&await Promise.all((await caches.keys()).map(e=>caches.delete(e)))}catch{}window.location.reload()}var Er=`nms-update-dismissed-sha`,Dr=216e5,Or=15e3;function kr(){let{t:e}=N(),{user:t}=I(),n=ke(),r=De(),[i,a]=(0,M.useState)(null),[o,s]=(0,M.useState)(`idle`),l=!!t?.is_super_admin;if((0,M.useEffect)(()=>{if(!l)return;let e=!0,t=async()=>{try{let t=await(await fetch(`/api/system/update/check`,{credentials:`include`})).json();if(!e||!t.success||t.up_to_date||!t.remote_sha)return;let n=``;try{n=localStorage.getItem(Er)||``}catch{}n!==t.remote_sha&&a(t)}catch{}},n=window.setTimeout(t,Or),r=window.setInterval(t,Dr);return()=>{e=!1,window.clearTimeout(n),window.clearInterval(r)}},[l]),!i||r.pathname.includes(`/settings/update`))return null;let u=()=>{try{localStorage.setItem(Er,i.remote_sha||``)}catch{}a(null)},d=()=>{a(null),n(`/dashboard/settings/update`)},f=async()=>{s(`applying`);try{let t=await(await fetch(`/api/system/update/apply`,{method:`POST`,credentials:`include`,headers:{"Content-Type":`application/json`,"X-Requested-With":`XMLHttpRequest`}})).json();if(!t.success){F.error(t.message||e(`cmp_update.failedToApplyThe`)),s(`idle`);return}if(!t.restarted){F.success(t.message),s(`idle`),a(null);return}s(`server`),await br({waitServer:!0,onPhase:s})}catch{F.error(e(`cmp_update.failedToApplyThe`)),s(`idle`)}},p=i.commits||[],m=o!==`idle`;return(0,P.jsx)(un,{open:!0,onClose:m?()=>void 0:u,icon:(0,P.jsx)(ce,{size:16,className:`text-accent`}),title:e(`cmp_update.updateAvailable`),size:`sm`,footer:m?void 0:(0,P.jsxs)(`div`,{className:`grid grid-cols-2 gap-2 w-full sm:flex sm:justify-end sm:w-auto`,children:[(0,P.jsx)(`button`,{onClick:u,className:`btn-cancel border border-brd px-4 py-2 rounded-xl text-sm`,children:e(`cmp_update.ignore`)}),(0,P.jsx)(`button`,{onClick:f,className:`btn-primary px-4 py-2 rounded-xl text-sm`,children:e(`cmp_update.updateNow`)})]}),children:(0,P.jsxs)(`div`,{className:`space-y-3 text-sm`,children:[(0,P.jsx)(`p`,{className:`text-tx2 leading-relaxed`,children:e(`cmp_update.summary`,{n:p.length,from:i.local_sha,to:i.remote_sha})}),p.length>0&&(0,P.jsxs)(`ul`,{className:`space-y-1 text-xs text-tx2 max-h-44 overflow-y-auto rounded-lg border border-brd p-3`,children:[p.slice(0,8).map(e=>(0,P.jsxs)(`li`,{className:`break-words`,children:[`• `,e.replace(/^[0-9a-f]{7,}\s+/,``)]},e)),p.length>8&&(0,P.jsx)(`li`,{className:`text-tx3`,children:e(`cmp_update.more`,{n:p.length-8})})]}),m?(0,P.jsxs)(`p`,{className:`flex items-center gap-2 text-tx2`,children:[(0,P.jsx)(c,{size:16,className:`animate-spin text-accent`}),e(o===`applying`?`cmp_update.applying`:o===`server`?`cmp_update.restarting`:o===`download`?`cmp_update.downloadingUi`:`cmp_update.reloading`)]}):(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`p`,{className:`text-xs text-tx3 leading-relaxed`,children:e(`cmp_update.downtimeNote`)}),(0,P.jsx)(`button`,{onClick:d,className:`text-xs text-accent hover:underline`,children:e(`cmp_update.details`)})]})]})})}function Ar(){let{t:e}=N(),t=De(),[n,r]=(0,M.useState)(sr()),[i,a]=(0,M.useState)(!1),[o,s]=(0,M.useState)(!1),c=()=>{o||(s(!0),mr())},l=(0,M.useRef)(t.pathname);return(0,M.useEffect)(()=>pr(()=>r(!0)),[]),(0,M.useEffect)(()=>{if(!n){l.current=t.pathname;return}t.pathname!==l.current&&mr()},[t.pathname,n]),!n||i?null:(0,P.jsxs)(`div`,{role:`status`,className:`fixed z-40 left-3 right-3 bottom-20 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm flex items-center gap-3 p-3 rounded-xl border border-accent/40 bg-surface shadow-lg text-sm`,children:[(0,P.jsx)(ie,{size:16,className:`text-accent flex-shrink-0`}),(0,P.jsx)(`span`,{className:`flex-1 text-tx2`,children:e(`cmp_update.swReady`)}),(0,P.jsxs)(`button`,{type:`button`,onClick:c,disabled:o,"aria-busy":o||void 0,className:`px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-80`,children:[o&&(0,P.jsx)(ie,{size:12,className:`animate-spin`}),e(o?`cmp_update.reloading`:`cmp_update.swReload`)]}),(0,P.jsx)(`button`,{type:`button`,onClick:()=>a(!0),"aria-label":e(`common.close`),className:`p-1 text-tx3 hover:text-tx1`,children:(0,P.jsx)(E,{size:14})})]})}var jr=`/dashboard/onus?filter=problem`,Mr=[{labelKey:`nav.home`,icon:b,path:`/dashboard`,end:!0},{labelKey:`nav.allOnus`,icon:w,path:`/dashboard/onus`,end:!0},{labelKey:`nav.problems`,icon:se,path:jr,end:!0},{labelKey:`nav.olt`,icon:S,path:`/dashboard/settings/olts`,end:!1}];function Nr(){let{t:e}=N(),[t,n]=(0,M.useState)(()=>window.innerWidth<1024),[r,i]=(0,M.useState)(!1),a=De();(0,M.useEffect)(()=>{i(!1)},[a.pathname]),(0,M.useEffect)(()=>{let e=()=>{window.innerWidth>=1024&&i(!1)};return window.addEventListener(`resize`,e),()=>window.removeEventListener(`resize`,e)},[]);let o=Mr,{data:s}=Ye({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),c=s?.unregistered||0,l=(s?.offline_count||0)+(s?.dyinggasp_count||0)+(s?.los_count||0),u=a.pathname===`/dashboard/onus`&&new URLSearchParams(a.search).get(`filter`)===`problem`,d=qt(`.bnav-active`,[a.pathname,a.search]);return(0,P.jsx)(tn,{children:(0,P.jsxs)(`div`,{className:`min-h-screen bg-[var(--bg-primary)] transition-colors duration-300`,children:[(0,P.jsx)(cn,{}),(0,P.jsx)(Bn,{}),(0,P.jsx)(Yn,{}),(0,P.jsx)(kr,{}),(0,P.jsx)(Ar,{}),(0,P.jsx)(`div`,{className:`app-mesh-bg`,"aria-hidden":`true`}),(0,P.jsx)(Xt,{collapsed:t,mobileOpen:r,onToggle:()=>n(!t),onMobileClose:()=>i(!1)}),(0,P.jsxs)(`div`,{className:j(`relative z-10 transition-all duration-300 min-h-screen`,t?`lg:ml-[70px]`:`lg:ml-[260px]`),children:[(0,P.jsx)(sn,{onMenuClick:()=>i(!r)}),(0,P.jsx)(Kt,{}),(0,P.jsx)(`main`,{className:`p-3 pb-20 lg:pb-6 md:p-4 lg:p-6 overflow-x-hidden max-w-[100vw]`,children:(0,P.jsx)(`div`,{className:`page-enter`,children:(0,P.jsx)(Ee,{})},a.pathname)})]}),(0,P.jsx)(`nav`,{className:`fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-brd lg:hidden mobile-bottom-nav`,children:(0,P.jsxs)(`div`,{ref:d.ref,className:`relative flex items-center justify-around h-14 px-1`,children:[(0,P.jsx)(`span`,{className:`slide-ind bnav-ind`,style:d.style,"aria-hidden":`true`}),o.map(t=>{let n=t.icon,r=t.path===jr,i=r?l:t.path===`/dashboard/onus`?c:0,a=r?`bg-danger`:`bg-warning`;return(0,P.jsx)(Ne,{to:t.path,end:t.end,className:({isActive:e})=>{let n=r?u:t.path===`/dashboard/onus`?e&&!u:e;return j(`bnav-item flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors relative z-[1]`,n?`bnav-active text-accent`:`text-tx3`)},children:({isActive:o})=>{let s=r?u:t.path===`/dashboard/onus`?o&&!u:o;return(0,P.jsxs)(P.Fragment,{children:[(0,P.jsxs)(`div`,{className:j(`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all`,s?`bg-accent/15 scale-105`:`scale-100`),children:[(0,P.jsx)(n,{size:20,strokeWidth:s?2.2:1.8}),i>0&&(0,P.jsx)(`div`,{className:j(`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center`,a),children:i>99?`99+`:i})]}),(0,P.jsx)(`span`,{children:e(t.labelKey)})]})}},t.path)}),(0,P.jsxs)(`button`,{type:`button`,onClick:()=>i(!0),"aria-expanded":r,className:j(`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all`,r?`text-accent`:`text-tx3`),children:[(0,P.jsx)(`div`,{className:`flex items-center justify-center w-8 h-8 rounded-lg`,children:(0,P.jsx)(we,{size:20,strokeWidth:1.8})}),(0,P.jsx)(`span`,{children:e(`nav.more`)})]})]})})]})})}var Pr={olt:S,onu:w,odp:C,odc:T,otb:_e,user:ve},Fr={olt:`/dashboard/olt-settings`,onu:`/dashboard/onu`,odp:`/dashboard/ftth`,odc:`/dashboard/ftth`,otb:`/dashboard/ftth`,user:`/dashboard/users`},Ir={olt:`OLT`,onu:`ONU`,odp:`ODP`,odc:`ODC`,otb:`OTB`,user:`User`};function Lr(){let{t:e}=N(),[t,n]=(0,M.useState)(!1),[i,a]=(0,M.useState)(``),[o,s]=(0,M.useState)({}),[c,l]=(0,M.useState)(!1),[u,d]=(0,M.useState)(0),f=ke(),p=(0,M.useRef)(null),m=(0,M.useRef)(void 0);(0,M.useEffect)(()=>{let e=e=>{(e.ctrlKey||e.metaKey)&&e.key===`k`&&(e.preventDefault(),n(e=>!e),a(``),s({}),d(0)),e.key===`Escape`&&n(!1)};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[]),(0,M.useEffect)(()=>{t&&p.current?.focus()},[t]),(0,M.useEffect)(()=>{if(m.current&&clearTimeout(m.current),i.length<2){s({}),l(!1);return}l(!0),m.current=setTimeout(async()=>{try{let e=await(await fetch(`/api/search?q=${encodeURIComponent(i)}`,{credentials:`include`})).json();s(e.results||{}),d(0)}catch{s({})}finally{l(!1)}},250)},[i]);let h=[];for(let[e,t]of Object.entries(o))for(let n of t)h.push({...n,type:e});let g=(0,M.useCallback)(e=>{n(!1);let t=Fr[e.type]||`/dashboard`;f(e.type===`onu`?`${t}/${e.id}`:e.type===`odp`||e.type===`odc`||e.type===`otb`?`${t}?${e.type}=${e.id}`:t)},[f]);return t?(0,P.jsx)(`div`,{className:`fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60`,onClick:()=>n(!1),children:(0,P.jsxs)(`div`,{className:`w-full max-w-lg mx-4 bg-surface border border-brd rounded-xl shadow-2xl overflow-hidden`,onClick:e=>e.stopPropagation(),children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-3 px-4 py-3 border-b border-brd`,children:[(0,P.jsx)(r,{size:16,className:`text-tx3 flex-shrink-0`}),(0,P.jsx)(`input`,{ref:p,value:i,onChange:e=>a(e.target.value),onKeyDown:e=>{e.key===`ArrowDown`&&(e.preventDefault(),d(e=>Math.min(e+1,h.length-1))),e.key===`ArrowUp`&&(e.preventDefault(),d(e=>Math.max(e-1,0))),e.key===`Enter`&&h[u]&&g(h[u])},placeholder:e(`cmp_search.searchOnusOltsOdps`),className:`flex-1 bg-transparent text-sm outline-none placeholder:text-tx3`}),(0,P.jsx)(`kbd`,{className:`px-1.5 py-0.5 text-[10px] rounded bg-glass text-tx3 font-mono`,children:`ESC`})]}),(0,P.jsxs)(`div`,{className:`max-h-[50vh] overflow-y-auto`,children:[i.length<2&&(0,P.jsx)(`div`,{className:`px-4 py-6 text-center text-xs text-tx3`,children:e(`cmp_search.typeAtLeast2`)}),c&&(0,P.jsx)(`div`,{className:`px-4 py-4 text-center text-xs text-tx3`,children:e(`cmp_search.searching`)}),!c&&i.length>=2&&h.length===0&&(0,P.jsx)(`div`,{className:`px-4 py-6 text-center text-xs text-tx3`,children:e(`cmp_search.noResults`)}),!c&&h.map((e,t)=>{let n=Pr[e.type]||w;return(0,P.jsxs)(`button`,{onClick:()=>g(e),className:j(`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors`,t===u?`bg-accent/10 text-accent`:`hover:bg-glass text-tx2`),onMouseEnter:()=>d(t),children:[(0,P.jsx)(n,{size:15,className:t===u?`text-accent`:`text-tx3`}),(0,P.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,P.jsx)(`div`,{className:`text-sm font-medium truncate`,children:e.name}),(0,P.jsxs)(`div`,{className:`text-[10px] text-tx3 truncate`,children:[Ir[e.type],e.serial?` • ${e.serial}`:``,e.ip?` • ${e.ip}`:``,e.olt?` • ${e.olt}`:``,e.status?` • ${e.status}`:``]})]}),(0,P.jsx)(`span`,{className:`text-[10px] text-tx3 uppercase flex-shrink-0`,children:e.type})]},`${e.type}-${e.id}`)})]}),(0,P.jsxs)(`div`,{className:`px-4 py-2 border-t border-brd flex items-center gap-3 text-[10px] text-tx3`,children:[(0,P.jsxs)(`span`,{children:[(0,P.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`↑↓`}),` `,e(`cmp_search.navigate`)]}),(0,P.jsxs)(`span`,{children:[(0,P.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`Enter`}),` `,e(`cmp_search.open`)]}),(0,P.jsxs)(`span`,{children:[(0,P.jsx)(`kbd`,{className:`px-1 py-0.5 bg-glass rounded font-mono`,children:`Ctrl+K`}),` `,e(`cmp_search.close`)]})]})]})}):null}var Rr=class extends M.Component{constructor(e){super(e),this.state={hasError:!1,error:null}}static getDerivedStateFromError(e){return{hasError:!0,error:e}}componentDidCatch(e,t){console.error(`ErrorBoundary caught:`,e,t)}handleReload=()=>{this.setState({hasError:!1,error:null}),window.location.reload()};render(){return this.state.hasError?(0,P.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4`,children:(0,P.jsxs)(`div`,{className:`max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center`,children:[(0,P.jsx)(`div`,{className:`mb-4 text-5xl`,children:`⚠️`}),(0,P.jsx)(`h1`,{className:`text-xl font-bold text-[var(--tx-primary)] mb-2`,children:`Something went wrong`}),(0,P.jsx)(`p`,{className:`text-sm text-[var(--tx-tertiary)] mb-4`,children:this.state.error?.message||`An unexpected error occurred.`}),(0,P.jsx)(`button`,{onClick:this.handleReload,className:`px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition`,children:`Reload Page`})]})}):this.props.children}};function zr(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function Br(e){if(Array.isArray(e))return e}function Vr(e){if(Array.isArray(e))return zr(e)}function Hr(e,t){if(!(e instanceof t))throw TypeError(`Cannot call a class as a function`)}function Ur(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,`value`in r&&(r.writable=!0),Object.defineProperty(e,$r(r.key),r)}}function Wr(e,t,n){return t&&Ur(e.prototype,t),n&&Ur(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}function Gr(e,t){var n=typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(!n){if(Array.isArray(e)||(n=ti(e))||t&&e&&typeof e.length==`number`){n&&(e=n);var r=0,i=function(){};return{s:i,n:function(){return r>=e.length?{done:!0}:{done:!1,value:e[r++]}},e:function(e){throw e},f:i}}throw TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}var a,o=!0,s=!1;return{s:function(){n=n.call(e)},n:function(){var e=n.next();return o=e.done,e},e:function(e){s=!0,a=e},f:function(){try{o||n.return==null||n.return()}finally{if(s)throw a}}}}function L(e,t,n){return(t=$r(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function Kr(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function qr(e,t){var n=e==null?null:typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(n!=null){var r,i,a,o,s=[],c=!0,l=!1;try{if(a=(n=n.call(e)).next,t===0){if(Object(n)!==n)return;c=!1}else for(;!(c=(r=a.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){l=!0,i=e}finally{try{if(!c&&n.return!=null&&(o=n.return(),Object(o)!==o))return}finally{if(l)throw i}}return s}}function Jr(){throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Yr(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Xr(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function R(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?Xr(Object(n),!0).forEach(function(t){L(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):Xr(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function Zr(e,t){return Br(e)||qr(e,t)||ti(e,t)||Jr()}function z(e){return Vr(e)||Kr(e)||ti(e)||Yr()}function Qr(e,t){if(typeof e!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(typeof r!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function $r(e){var t=Qr(e,`string`);return typeof t==`symbol`?t:t+``}function ei(e){"@babel/helpers - typeof";return ei=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},ei(e)}function ti(e,t){if(e){if(typeof e==`string`)return zr(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?zr(e,t):void 0}}var ni=function(){},ri={},ii={},ai=null,oi={mark:ni,measure:ni};try{typeof window<`u`&&(ri=window),typeof document<`u`&&(ii=document),typeof MutationObserver<`u`&&(ai=MutationObserver),typeof performance<`u`&&(oi=performance)}catch{}var si=(ri.navigator||{}).userAgent,ci=si===void 0?``:si,B=ri,V=ii,li=ai,ui=oi;B.document;var H=!!V.documentElement&&!!V.head&&typeof V.addEventListener==`function`&&typeof V.createElement==`function`,di=~ci.indexOf(`MSIE`)||~ci.indexOf(`Trident/`),fi,pi=/fa(k|kd|s|r|l|t|d|dr|dl|dt|b|slr|slpr|wsb|tl|ns|nds|es|gt|jr|jfr|jdr|usb|ufsb|udsb|cr|ss|sr|sl|st|sds|sdr|sdl|sdt|sldr|slpdr|pr|ms|vs)?[\-\ ]/,mi=/Font ?Awesome ?([567 ]*)(Solid|Regular|Light|Thin|Duotone|Brands|Free|Pro|Sharp Duotone|Sharp|Kit|Notdog Duo|Notdog|Chisel|Etch|Graphite|Thumbprint|Jelly Fill|Jelly Duo|Jelly|Utility|Utility Fill|Utility Duo|Slab Press|Slab|Slab Duo|Slab Press Duo|Pixel|Mosaic|Vellum|Whiteboard)?.*/i,hi={classic:{fa:`solid`,fas:`solid`,"fa-solid":`solid`,far:`regular`,"fa-regular":`regular`,fal:`light`,"fa-light":`light`,fat:`thin`,"fa-thin":`thin`,fab:`brands`,"fa-brands":`brands`},duotone:{fa:`solid`,fad:`solid`,"fa-solid":`solid`,"fa-duotone":`solid`,fadr:`regular`,"fa-regular":`regular`,fadl:`light`,"fa-light":`light`,fadt:`thin`,"fa-thin":`thin`},sharp:{fa:`solid`,fass:`solid`,"fa-solid":`solid`,fasr:`regular`,"fa-regular":`regular`,fasl:`light`,"fa-light":`light`,fast:`thin`,"fa-thin":`thin`},"sharp-duotone":{fa:`solid`,fasds:`solid`,"fa-solid":`solid`,fasdr:`regular`,"fa-regular":`regular`,fasdl:`light`,"fa-light":`light`,fasdt:`thin`,"fa-thin":`thin`},slab:{"fa-regular":`regular`,faslr:`regular`},"slab-press":{"fa-regular":`regular`,faslpr:`regular`},"slab-duo":{"fa-regular":`regular`,fasldr:`regular`},"slab-press-duo":{"fa-regular":`regular`,faslpdr:`regular`},thumbprint:{"fa-light":`light`,fatl:`light`},vellum:{"fa-solid":`solid`,favs:`solid`},pixel:{"fa-regular":`regular`,fapr:`regular`},mosaic:{"fa-solid":`solid`,fams:`solid`},whiteboard:{"fa-semibold":`semibold`,fawsb:`semibold`},notdog:{"fa-solid":`solid`,fans:`solid`},"notdog-duo":{"fa-solid":`solid`,fands:`solid`},etch:{"fa-solid":`solid`,faes:`solid`},graphite:{"fa-thin":`thin`,fagt:`thin`},jelly:{"fa-regular":`regular`,fajr:`regular`},"jelly-fill":{"fa-regular":`regular`,fajfr:`regular`},"jelly-duo":{"fa-regular":`regular`,fajdr:`regular`},chisel:{"fa-regular":`regular`,facr:`regular`},utility:{"fa-semibold":`semibold`,fausb:`semibold`},"utility-duo":{"fa-semibold":`semibold`,faudsb:`semibold`},"utility-fill":{"fa-semibold":`semibold`,faufsb:`semibold`}},gi={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},_i=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`],U=`classic`,vi=`duotone`,yi=`sharp`,bi=`sharp-duotone`,xi=`chisel`,Si=`etch`,Ci=`graphite`,wi=`jelly`,Ti=`jelly-duo`,Ei=`jelly-fill`,Di=`mosaic`,Oi=`notdog`,ki=`notdog-duo`,Ai=`pixel`,ji=`slab`,Mi=`slab-duo`,Ni=`slab-press`,Pi=`slab-press-duo`,Fi=`thumbprint`,Ii=`utility`,Li=`utility-duo`,Ri=`utility-fill`,zi=`vellum`,Bi=`whiteboard`,Vi=`Classic`,Hi=`Duotone`,Ui=`Sharp`,Wi=`Sharp Duotone`,Gi=`Chisel`,Ki=`Etch`,qi=`Graphite`,Ji=`Jelly`,Yi=`Jelly Duo`,Xi=`Jelly Fill`,Zi=`Mosaic`,Qi=`Notdog`,$i=`Notdog Duo`,ea=`Pixel`,ta=`Slab`,na=`Slab Duo`,ra=`Slab Press`,ia=`Slab Press Duo`,aa=`Thumbprint`,oa=`Utility`,sa=`Utility Duo`,ca=`Utility Fill`,la=`Vellum`,ua=`Whiteboard`,da=[U,vi,yi,bi,xi,Si,Ci,wi,Ti,Ei,Di,Oi,ki,Ai,ji,Mi,Ni,Pi,Fi,Ii,Li,Ri,zi,Bi];fi={},L(L(L(L(L(L(L(L(L(L(fi,U,Vi),vi,Hi),yi,Ui),bi,Wi),xi,Gi),Si,Ki),Ci,qi),wi,Ji),Ti,Yi),Ei,Xi),L(L(L(L(L(L(L(L(L(L(fi,Di,Zi),Oi,Qi),ki,$i),Ai,ea),ji,ta),Mi,na),Ni,ra),Pi,ia),Fi,aa),Ii,oa),L(L(L(L(fi,Li,sa),Ri,ca),zi,la),Bi,ua);var fa={classic:{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},duotone:{900:`fad`,400:`fadr`,300:`fadl`,100:`fadt`},sharp:{900:`fass`,400:`fasr`,300:`fasl`,100:`fast`},"sharp-duotone":{900:`fasds`,400:`fasdr`,300:`fasdl`,100:`fasdt`},slab:{400:`faslr`},"slab-press":{400:`faslpr`},"slab-duo":{400:`fasldr`},"slab-press-duo":{400:`faslpdr`},vellum:{900:`favs`},mosaic:{900:`fams`},pixel:{400:`fapr`},whiteboard:{600:`fawsb`},thumbprint:{300:`fatl`},notdog:{900:`fans`},"notdog-duo":{900:`fands`},etch:{900:`faes`},graphite:{100:`fagt`},chisel:{400:`facr`},jelly:{400:`fajr`},"jelly-fill":{400:`fajfr`},"jelly-duo":{400:`fajdr`},utility:{600:`fausb`},"utility-duo":{600:`faudsb`},"utility-fill":{600:`faufsb`}},pa={"Font Awesome 7 Free":{900:`fas`,400:`far`},"Font Awesome 7 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},"Font Awesome 7 Brands":{400:`fab`,normal:`fab`},"Font Awesome 7 Duotone":{900:`fad`,400:`fadr`,normal:`fadr`,300:`fadl`,100:`fadt`},"Font Awesome 7 Sharp":{900:`fass`,400:`fasr`,normal:`fasr`,300:`fasl`,100:`fast`},"Font Awesome 7 Sharp Duotone":{900:`fasds`,400:`fasdr`,normal:`fasdr`,300:`fasdl`,100:`fasdt`},"Font Awesome 7 Jelly":{400:`fajr`,normal:`fajr`},"Font Awesome 7 Jelly Fill":{400:`fajfr`,normal:`fajfr`},"Font Awesome 7 Jelly Duo":{400:`fajdr`,normal:`fajdr`},"Font Awesome 7 Slab":{400:`faslr`,normal:`faslr`},"Font Awesome 7 Slab Press":{400:`faslpr`,normal:`faslpr`},"Font Awesome 7 Slab Duo":{400:`fasldr`,normal:`fasldr`},"Font Awesome 7 Slab Press Duo":{400:`faslpdr`,normal:`faslpdr`},"Font Awesome 7 Pixel":{400:`fapr`,normal:`fapr`},"Font Awesome 7 Mosaic":{900:`fams`,normal:`fams`},"Font Awesome 7 Vellum":{900:`favs`,normal:`favs`},"Font Awesome 7 Thumbprint":{300:`fatl`,normal:`fatl`},"Font Awesome 7 Notdog":{900:`fans`,normal:`fans`},"Font Awesome 7 Notdog Duo":{900:`fands`,normal:`fands`},"Font Awesome 7 Etch":{900:`faes`,normal:`faes`},"Font Awesome 7 Graphite":{100:`fagt`,normal:`fagt`},"Font Awesome 7 Chisel":{400:`facr`,normal:`facr`},"Font Awesome 7 Whiteboard":{600:`fawsb`,normal:`fawsb`},"Font Awesome 7 Utility":{600:`fausb`,normal:`fausb`},"Font Awesome 7 Utility Duo":{600:`faudsb`,normal:`faudsb`},"Font Awesome 7 Utility Fill":{600:`faufsb`,normal:`faufsb`}},ma=new Map([[`classic`,{defaultShortPrefixId:`fas`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`,`brands`],futureStyleIds:[],defaultFontWeight:900}],[`duotone`,{defaultShortPrefixId:`fad`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp`,{defaultShortPrefixId:`fass`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp-duotone`,{defaultShortPrefixId:`fasds`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`chisel`,{defaultShortPrefixId:`facr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`etch`,{defaultShortPrefixId:`faes`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`graphite`,{defaultShortPrefixId:`fagt`,defaultStyleId:`thin`,styleIds:[`thin`],futureStyleIds:[],defaultFontWeight:100}],[`jelly`,{defaultShortPrefixId:`fajr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-duo`,{defaultShortPrefixId:`fajdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-fill`,{defaultShortPrefixId:`fajfr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`mosaic`,{defaultShortPrefixId:`fams`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog`,{defaultShortPrefixId:`fans`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog-duo`,{defaultShortPrefixId:`fands`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`pixel`,{defaultShortPrefixId:`fapr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab`,{defaultShortPrefixId:`faslr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-duo`,{defaultShortPrefixId:`fasldr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press`,{defaultShortPrefixId:`faslpr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press-duo`,{defaultShortPrefixId:`faslpdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`thumbprint`,{defaultShortPrefixId:`fatl`,defaultStyleId:`light`,styleIds:[`light`],futureStyleIds:[],defaultFontWeight:300}],[`utility`,{defaultShortPrefixId:`fausb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-duo`,{defaultShortPrefixId:`faudsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-fill`,{defaultShortPrefixId:`faufsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`vellum`,{defaultShortPrefixId:`favs`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`whiteboard`,{defaultShortPrefixId:`fawsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}]]),ha={chisel:{regular:`facr`},classic:{brands:`fab`,light:`fal`,regular:`far`,solid:`fas`,thin:`fat`},duotone:{light:`fadl`,regular:`fadr`,solid:`fad`,thin:`fadt`},etch:{solid:`faes`},graphite:{thin:`fagt`},jelly:{regular:`fajr`},"jelly-duo":{regular:`fajdr`},"jelly-fill":{regular:`fajfr`},mosaic:{solid:`fams`},notdog:{solid:`fans`},"notdog-duo":{solid:`fands`},pixel:{regular:`fapr`},sharp:{light:`fasl`,regular:`fasr`,solid:`fass`,thin:`fast`},"sharp-duotone":{light:`fasdl`,regular:`fasdr`,solid:`fasds`,thin:`fasdt`},slab:{regular:`faslr`},"slab-duo":{regular:`fasldr`},"slab-press":{regular:`faslpr`},"slab-press-duo":{regular:`faslpdr`},thumbprint:{light:`fatl`},utility:{semibold:`fausb`},"utility-duo":{semibold:`faudsb`},"utility-fill":{semibold:`faufsb`},vellum:{solid:`favs`},whiteboard:{semibold:`fawsb`}},ga=[`fak`,`fa-kit`,`fakd`,`fa-kit-duotone`],_a={kit:{fak:`kit`,"fa-kit":`kit`},"kit-duotone":{fakd:`kit-duotone`,"fa-kit-duotone":`kit-duotone`}},va=[`kit`];L(L({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var ya={kit:{"fa-kit":`fak`},"kit-duotone":{"fa-kit-duotone":`fakd`}},ba={"Font Awesome Kit":{400:`fak`,normal:`fak`},"Font Awesome Kit Duotone":{400:`fakd`,normal:`fakd`}},xa={kit:{fak:`fa-kit`},"kit-duotone":{fakd:`fa-kit-duotone`}},Sa={kit:{kit:`fak`},"kit-duotone":{"kit-duotone":`fakd`}},Ca,wa={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},Ta=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`];Ca={},L(L(L(L(L(L(L(L(L(L(Ca,`classic`,`Classic`),`duotone`,`Duotone`),`sharp`,`Sharp`),`sharp-duotone`,`Sharp Duotone`),`chisel`,`Chisel`),`etch`,`Etch`),`graphite`,`Graphite`),`jelly`,`Jelly`),`jelly-duo`,`Jelly Duo`),`jelly-fill`,`Jelly Fill`),L(L(L(L(L(L(L(L(L(L(Ca,`mosaic`,`Mosaic`),`notdog`,`Notdog`),`notdog-duo`,`Notdog Duo`),`pixel`,`Pixel`),`slab`,`Slab`),`slab-duo`,`Slab Duo`),`slab-press`,`Slab Press`),`slab-press-duo`,`Slab Press Duo`),`thumbprint`,`Thumbprint`),`utility`,`Utility`),L(L(L(L(Ca,`utility-duo`,`Utility Duo`),`utility-fill`,`Utility Fill`),`vellum`,`Vellum`),`whiteboard`,`Whiteboard`),L(L({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var Ea={classic:{"fa-brands":`fab`,"fa-duotone":`fad`,"fa-light":`fal`,"fa-regular":`far`,"fa-solid":`fas`,"fa-thin":`fat`},duotone:{"fa-regular":`fadr`,"fa-light":`fadl`,"fa-thin":`fadt`},sharp:{"fa-solid":`fass`,"fa-regular":`fasr`,"fa-light":`fasl`,"fa-thin":`fast`},"sharp-duotone":{"fa-solid":`fasds`,"fa-regular":`fasdr`,"fa-light":`fasdl`,"fa-thin":`fasdt`},slab:{"fa-regular":`faslr`},"slab-press":{"fa-regular":`faslpr`},"slab-duo":{"fa-regular":`fasldr`},"slab-press-duo":{"fa-regular":`faslpdr`},pixel:{"fa-regular":`fapr`},mosaic:{"fa-solid":`fams`},vellum:{"fa-solid":`favs`},whiteboard:{"fa-semibold":`fawsb`},thumbprint:{"fa-light":`fatl`},notdog:{"fa-solid":`fans`},"notdog-duo":{"fa-solid":`fands`},etch:{"fa-solid":`faes`},graphite:{"fa-thin":`fagt`},jelly:{"fa-regular":`fajr`},"jelly-fill":{"fa-regular":`fajfr`},"jelly-duo":{"fa-regular":`fajdr`},chisel:{"fa-regular":`facr`},utility:{"fa-semibold":`fausb`},"utility-duo":{"fa-semibold":`faudsb`},"utility-fill":{"fa-semibold":`faufsb`}},Da={classic:[`fas`,`far`,`fal`,`fat`,`fad`],duotone:[`fadr`,`fadl`,`fadt`],sharp:[`fass`,`fasr`,`fasl`,`fast`],"sharp-duotone":[`fasds`,`fasdr`,`fasdl`,`fasdt`],slab:[`faslr`],"slab-press":[`faslpr`],"slab-duo":[`fasldr`],"slab-press-duo":[`faslpdr`],pixel:[`fapr`],mosaic:[`fams`],vellum:[`favs`],whiteboard:[`fawsb`],thumbprint:[`fatl`],notdog:[`fans`],"notdog-duo":[`fands`],etch:[`faes`],graphite:[`fagt`],jelly:[`fajr`],"jelly-fill":[`fajfr`],"jelly-duo":[`fajdr`],chisel:[`facr`],utility:[`fausb`],"utility-duo":[`faudsb`],"utility-fill":[`faufsb`]},Oa={classic:{fab:`fa-brands`,fad:`fa-duotone`,fal:`fa-light`,far:`fa-regular`,fas:`fa-solid`,fat:`fa-thin`},duotone:{fadr:`fa-regular`,fadl:`fa-light`,fadt:`fa-thin`},sharp:{fass:`fa-solid`,fasr:`fa-regular`,fasl:`fa-light`,fast:`fa-thin`},"sharp-duotone":{fasds:`fa-solid`,fasdr:`fa-regular`,fasdl:`fa-light`,fasdt:`fa-thin`},slab:{faslr:`fa-regular`},"slab-press":{faslpr:`fa-regular`},"slab-duo":{fasldr:`fa-regular`},"slab-press-duo":{faslpdr:`fa-regular`},pixel:{fapr:`fa-regular`},mosaic:{fams:`fa-solid`},vellum:{favs:`fa-solid`},whiteboard:{fawsb:`fa-semibold`},thumbprint:{fatl:`fa-light`},notdog:{fans:`fa-solid`},"notdog-duo":{fands:`fa-solid`},etch:{faes:`fa-solid`},graphite:{fagt:`fa-thin`},jelly:{fajr:`fa-regular`},"jelly-fill":{fajfr:`fa-regular`},"jelly-duo":{fajdr:`fa-regular`},chisel:{facr:`fa-regular`},utility:{fausb:`fa-semibold`},"utility-duo":{faudsb:`fa-semibold`},"utility-fill":{faufsb:`fa-semibold`}},ka=`fa.fas.far.fal.fat.fad.fadr.fadl.fadt.fab.fass.fasr.fasl.fast.fasds.fasdr.fasdl.fasdt.faslr.faslpr.fasldr.faslpdr.fapr.fams.favs.fawsb.fatl.fans.fands.faes.fagt.fajr.fajfr.fajdr.facr.fausb.faudsb.faufsb`.split(`.`).concat(Ta,[`fa-solid`,`fa-regular`,`fa-light`,`fa-thin`,`fa-duotone`,`fa-brands`,`fa-semibold`]),Aa=[`solid`,`regular`,`light`,`thin`,`duotone`,`brands`,`semibold`],ja=[1,2,3,4,5,6,7,8,9,10],Ma=ja.concat([11,12,13,14,15,16,17,18,19,20]),Na=[].concat(z(Object.keys(Da)),Aa,[`aw`,`fw`,`pull-left`,`pull-right`],[`2xs`,`xs`,`sm`,`lg`,`xl`,`2xl`,`beat`,`beat-fade`,`border`,`bounce`,`buzz`,`canvas-square`,`canvas-roomy`,`fade`,`flip-360`,`flip-both`,`flip-horizontal`,`flip-vertical`,`flip`,`float`,`inverse`,`jello`,`layers`,`layers-bottom-left`,`layers-bottom-right`,`layers-counter`,`layers-text`,`layers-top-left`,`layers-top-right`,`li`,`pull-end`,`pull-start`,`pulse`,`rotate-180`,`rotate-270`,`rotate-90`,`rotate-by`,`shake`,`spin-pulse`,`spin-reverse`,`spin`,`spin-snap`,`spin-snap-4`,`spin-snap-8`,`stack-1x`,`stack-2x`,`stack`,`swing`,`ul`,`wag`,`width-auto`,`width-fixed`,wa.GROUP,wa.SWAP_OPACITY,wa.PRIMARY,wa.SECONDARY],ja.map(function(e){return`${e}x`}),Ma.map(function(e){return`w-${e}`})),Pa={"Font Awesome 5 Free":{900:`fas`,400:`far`},"Font Awesome 5 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`},"Font Awesome 5 Brands":{400:`fab`,normal:`fab`},"Font Awesome 5 Duotone":{900:`fad`}},W=`___FONT_AWESOME___`,Fa=16,Ia=`fa`,La=`svg-inline--fa`,Ra=`data-fa-i2svg`,za=`data-fa-pseudo-element`,Ba=`data-fa-pseudo-element-pending`,Va=`data-prefix`,Ha=`data-icon`,Ua=`fontawesome-i2svg`,Wa=`async`,Ga=[`HTML`,`HEAD`,`STYLE`,`SCRIPT`],Ka=[`::before`,`::after`,`:before`,`:after`],qa=function(){try{return!0}catch{return!1}}();function Ja(e){return new Proxy(e,{get:function(e,t){return t in e?e[t]:e[U]}})}var Ya=R({},hi);Ya[U]=R(R(R(R({},{"fa-duotone":`duotone`}),hi[U]),_a.kit),_a[`kit-duotone`]);var Xa=Ja(Ya),Za=R({},ha);Za[U]=R(R(R(R({},{duotone:`fad`}),Za[U]),Sa.kit),Sa[`kit-duotone`]);var Qa=Ja(Za),$a=R({},Oa);$a[U]=R(R({},$a[U]),xa.kit);var eo=Ja($a),to=R({},Ea);to[U]=R(R({},to[U]),ya.kit),Ja(to);var no=pi,ro=`fa-layers-text`,io=mi;Ja(R({},fa));var ao=[`class`,`data-prefix`,`data-icon`,`data-fa-transform`,`data-fa-mask`],oo=gi,so=[].concat(z(va),z(Na)),co=B.FontAwesomeConfig||{};function lo(e){var t=V.querySelector(`script[`+e+`]`);if(t)return t.getAttribute(e)}function uo(e){return e===``?!0:e===`false`?!1:e===`true`||e}V&&typeof V.querySelector==`function`&&[[`data-family-prefix`,`familyPrefix`],[`data-css-prefix`,`cssPrefix`],[`data-family-default`,`familyDefault`],[`data-style-default`,`styleDefault`],[`data-replacement-class`,`replacementClass`],[`data-auto-replace-svg`,`autoReplaceSvg`],[`data-auto-add-css`,`autoAddCss`],[`data-search-pseudo-elements`,`searchPseudoElements`],[`data-search-pseudo-elements-warnings`,`searchPseudoElementsWarnings`],[`data-search-pseudo-elements-full-scan`,`searchPseudoElementsFullScan`],[`data-observe-mutations`,`observeMutations`],[`data-mutate-approach`,`mutateApproach`],[`data-keep-original-source`,`keepOriginalSource`],[`data-measure-performance`,`measurePerformance`],[`data-show-missing-icons`,`showMissingIcons`]].forEach(function(e){var t=Zr(e,2),n=t[0],r=t[1],i=uo(lo(n));i!=null&&(co[r]=i)});var fo={styleDefault:`solid`,familyDefault:U,cssPrefix:Ia,replacementClass:La,autoReplaceSvg:!0,autoAddCss:!0,searchPseudoElements:!1,searchPseudoElementsWarnings:!0,searchPseudoElementsFullScan:!1,observeMutations:!0,mutateApproach:`async`,keepOriginalSource:!0,measurePerformance:!1,showMissingIcons:!0};co.familyPrefix&&(co.cssPrefix=co.familyPrefix);var po=R(R({},fo),co);po.autoReplaceSvg||(po.observeMutations=!1);var G={};Object.keys(fo).forEach(function(e){Object.defineProperty(G,e,{enumerable:!0,set:function(t){po[e]=t,mo.forEach(function(e){return e(G)})},get:function(){return po[e]}})}),Object.defineProperty(G,"familyPrefix",{enumerable:!0,set:function(e){po.cssPrefix=e,mo.forEach(function(e){return e(G)})},get:function(){return po.cssPrefix}}),B.FontAwesomeConfig=G;var mo=[];function ho(e){return mo.push(e),function(){mo.splice(mo.indexOf(e),1)}}var K=Fa,q={size:16,x:0,y:0,rotate:0,flipX:!1,flipY:!1};function go(e){if(e&&H){var t=V.createElement(`style`);t.setAttribute(`type`,`text/css`),t.innerHTML=e;for(var n=V.head.childNodes,r=null,i=n.length-1;i>-1;i--){var a=n[i],o=(a.tagName||``).toUpperCase();[`STYLE`,`LINK`].indexOf(o)>-1&&(r=a)}return V.head.insertBefore(t,r),e}}var _o=`0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`;function vo(){for(var e=12,t=``;e-->0;)t+=_o[Math.random()*62|0];return t}function yo(e){for(var t=[],n=(e||[]).length>>>0;n--;)t[n]=e[n];return t}function bo(e){return e.classList?yo(e.classList):(e.getAttribute(`class`)||``).split(` `).filter(function(e){return e})}function xo(e){return`${e}`.replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function So(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}="${xo(e[n])}" `},``).trim()}function Co(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}: ${e[n].trim()};`},``)}function wo(e){return e.size!==q.size||e.x!==q.x||e.y!==q.y||e.rotate!==q.rotate||e.flipX||e.flipY}function To(e){var t=e.transform,n=e.containerWidth,r=e.iconWidth;return{outer:{transform:`translate(${n/2} 256)`},inner:{transform:`${`translate(${t.x*32}, ${t.y*32}) `} ${`scale(${t.size/16*(t.flipX?-1:1)}, ${t.size/16*(t.flipY?-1:1)}) `} ${`rotate(${t.rotate} 0 0)`}`},path:{transform:`translate(${r/2*-1} -256)`}}}function Eo(e){var t=e.transform,n=e.width,r=n===void 0?Fa:n,i=e.height,a=i===void 0?Fa:i,o=e.startCentered,s=o!==void 0&&o,c=``;return c+=s&&di?`translate(${t.x/K-r/2}em, ${t.y/K-a/2}em) `:s?`translate(calc(-50% + ${t.x/K}em), calc(-50% + ${t.y/K}em)) `:`translate(${t.x/K}em, ${t.y/K}em) `,c+=`scale(${t.size/K*(t.flipX?-1:1)}, ${t.size/K*(t.flipY?-1:1)}) `,c+=`rotate(${t.rotate}deg) `,c}var Do=`:root, :host {
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
}`;function Oo(){var e=Ia,t=La,n=G.cssPrefix,r=G.replacementClass,i=Do;if(n!==e||r!==t){var a=RegExp(`\\.${e}\\-`,`g`),o=RegExp(`\\--${e}\\-`,`g`),s=RegExp(`\\.${t}`,`g`);i=i.replace(a,`.${n}-`).replace(o,`--${n}-`).replace(s,`.${r}`)}return i}var ko=!1;function Ao(){G.autoAddCss&&!ko&&(go(Oo()),ko=!0)}var jo={mixout:function(){return{dom:{css:Oo,insertCss:Ao}}},hooks:function(){return{beforeDOMElementCreation:function(){Ao()},beforeI2svg:function(){Ao()}}}},J=B||{};J[W]||(J[W]={}),J[W].styles||(J[W].styles={}),J[W].hooks||(J[W].hooks={}),J[W].shims||(J[W].shims=[]);var Y=J[W],Mo=[],No=function(){V.removeEventListener(`DOMContentLoaded`,No),Po=1,Mo.map(function(e){return e()})},Po=!1;H&&(Po=(V.documentElement.doScroll?/^loaded|^c/:/^loaded|^i|^c/).test(V.readyState),Po||V.addEventListener(`DOMContentLoaded`,No));function Fo(e){H&&(Po?setTimeout(e,0):Mo.push(e))}function Io(e){var t=e.tag,n=e.attributes,r=n===void 0?{}:n,i=e.children,a=i===void 0?[]:i;return typeof e==`string`?xo(e):`<${t} ${So(r)}>${a.map(Io).join(``)}</${t}>`}function Lo(e,t,n){if(e&&e[t]&&e[t][n])return{prefix:t,iconName:n,icon:e[t][n]}}var Ro=function(e,t){return function(n,r,i,a){return e.call(t,n,r,i,a)}},zo=function(e,t,n,r){var i=Object.keys(e),a=i.length,o=r===void 0?t:Ro(t,r),s,c,l;for(n===void 0?(s=1,l=e[i[0]]):(s=0,l=n);s<a;s++)c=i[s],l=o(l,e[c],c,e);return l};function Bo(e){return z(e).length===1?e.codePointAt(0).toString(16):null}function Vo(e){return Object.keys(e).reduce(function(t,n){var r=e[n];return r.icon?t[r.iconName]=r.icon:t[n]=r,t},{})}function Ho(e,t){var n=(arguments.length>2&&arguments[2]!==void 0?arguments[2]:{}).skipHooks,r=n!==void 0&&n,i=Vo(t);typeof Y.hooks.addPack==`function`&&!r?Y.hooks.addPack(e,Vo(t)):Y.styles[e]=R(R({},Y.styles[e]||{}),i),e===`fas`&&Ho(`fa`,t)}var Uo=Y.styles,Wo=Y.shims,Go=Object.keys(eo),Ko=Go.reduce(function(e,t){return e[t]=Object.keys(eo[t]),e},{}),qo=null,Jo={},Yo={},Xo={},Zo={},Qo={};function $o(e){return~so.indexOf(e)}function es(e,t){var n=t.split(`-`),r=n[0],i=n.slice(1).join(`-`);return r===e&&i!==``&&!$o(i)?i:null}var ts=function(){var e=function(e){return zo(Uo,function(t,n,r){return t[r]=zo(n,e,{}),t},{})};Jo=e(function(e,t,n){return t[3]&&(e[t[3]]=n),t[2]&&t[2].filter(function(e){return typeof e==`number`}).forEach(function(t){e[t.toString(16)]=n}),e}),Yo=e(function(e,t,n){return e[n]=n,t[2]&&t[2].filter(function(e){return typeof e==`string`}).forEach(function(t){e[t]=n}),e}),Qo=e(function(e,t,n){var r=t[2];return e[n]=n,r.forEach(function(t){e[t]=n}),e});var t=`far`in Uo||G.autoFetchSvg,n=zo(Wo,function(e,n){var r=n[0],i=n[1],a=n[2];return i===`far`&&!t&&(i=`fas`),typeof r==`string`&&(e.names[r]={prefix:i,iconName:a}),typeof r==`number`&&(e.unicodes[r.toString(16)]={prefix:i,iconName:a}),e},{names:{},unicodes:{}});Xo=n.names,Zo=n.unicodes,qo=ls(G.styleDefault,{family:G.familyDefault})};ho(function(e){qo=ls(e.styleDefault,{family:G.familyDefault})}),ts();function ns(e,t){return(Jo[e]||{})[t]}function rs(e,t){return(Yo[e]||{})[t]}function is(e,t){return(Qo[e]||{})[t]}function as(e){return Xo[e]||{prefix:null,iconName:null}}function os(e){var t=Zo[e],n=ns(`fas`,e);return t||(n?{prefix:`fas`,iconName:n}:null)||{prefix:null,iconName:null}}function X(){return qo}var ss=function(){return{prefix:null,iconName:null,rest:[]}};function cs(e){var t=U,n=Go.reduce(function(e,t){return e[t]=`${G.cssPrefix}-${t}`,e},{});return da.forEach(function(r){(e.includes(n[r])||e.some(function(e){return Ko[r].includes(e)}))&&(t=r)}),t}function ls(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).family,n=t===void 0?U:t,r=Xa[n][e];if(n===vi&&!e)return`fad`;var i=Qa[n][e]||Qa[n][r],a=e in Y.styles?e:null;return i||a||null}function us(e){var t=[],n=null;return e.forEach(function(e){var r=es(G.cssPrefix,e);r?n=r:e&&t.push(e)}),{iconName:n,rest:t}}function ds(e){return e.sort().filter(function(e,t,n){return n.indexOf(e)===t})}var fs=ka.concat(ga);function ps(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).skipLookups,n=t!==void 0&&t,r=null,i=ds(e.filter(function(e){return fs.includes(e)})),a=ds(e.filter(function(e){return!fs.includes(e)})),o=Zr(i.filter(function(e){return r=e,!_i.includes(e)}),1)[0],s=o===void 0?null:o,c=cs(i),l=R(R({},us(a)),{},{prefix:ls(s,{family:c})});return R(R(R({},l),_s({values:e,family:c,styles:Uo,config:G,canonical:l,givenPrefix:r})),ms(n,r,l))}function ms(e,t,n){var r=n.prefix,i=n.iconName;if(e||!r||!i)return{prefix:r,iconName:i};var a=t===`fa`?as(i):{},o=is(r,i);return i=a.iconName||o||i,r=a.prefix||r,r===`far`&&!Uo.far&&Uo.fas&&!G.autoFetchSvg&&(r=`fas`),{prefix:r,iconName:i}}var hs=da.filter(function(e){return e!==U||e!==vi}),gs=Object.keys(Oa).filter(function(e){return e!==U}).map(function(e){return Object.keys(Oa[e])}).flat();function _s(e){var t=e.values,n=e.family,r=e.canonical,i=e.givenPrefix,a=i===void 0?``:i,o=e.styles,s=o===void 0?{}:o,c=e.config,l=c===void 0?{}:c,u=n===vi,d=t.includes(`fa-duotone`)||t.includes(`fad`),f=l.familyDefault===`duotone`,p=r.prefix===`fad`||r.prefix===`fa-duotone`;return!u&&(d||f||p)&&(r.prefix=`fad`),(t.includes(`fa-brands`)||t.includes(`fab`))&&(r.prefix=`fab`),!r.prefix&&hs.includes(n)&&(Object.keys(s).find(function(e){return gs.includes(e)})||l.autoFetchSvg)&&(r.prefix=ma.get(n).defaultShortPrefixId,r.iconName=is(r.prefix,r.iconName)||r.iconName),(r.prefix===`fa`||a===`fa`)&&(r.prefix=X()||`fas`),r}var vs=function(){function e(){Hr(this,e),this.definitions={}}return Wr(e,[{key:`add`,value:function(){var e=this,t=[...arguments].reduce(this._pullDefinitions,{});Object.keys(t).forEach(function(n){e.definitions[n]=R(R({},e.definitions[n]||{}),t[n]),Ho(n,t[n]);var r=eo[U][n];r&&Ho(r,t[n]),ts()})}},{key:`reset`,value:function(){this.definitions={}}},{key:`_pullDefinitions`,value:function(e,t){var n=t.prefix&&t.iconName&&t.icon?{0:t}:t;return Object.keys(n).map(function(t){var r=n[t],i=r.prefix,a=r.iconName,o=r.icon,s=o[2];e[i]||(e[i]={}),s.length>0&&s.forEach(function(t){typeof t==`string`&&(e[i][t]=o)}),e[i][a]=o}),e}}])}(),ys=[],bs={},xs={},Ss=Object.keys(xs);function Cs(e,t){var n=t.mixoutsTo;return ys=e,bs={},Object.keys(xs).forEach(function(e){Ss.indexOf(e)===-1&&delete xs[e]}),ys.forEach(function(e){var t=e.mixout?e.mixout():{};if(Object.keys(t).forEach(function(e){typeof t[e]==`function`&&(n[e]=t[e]),ei(t[e])===`object`&&Object.keys(t[e]).forEach(function(r){n[e]||(n[e]={}),n[e][r]=t[e][r]})}),e.hooks){var r=e.hooks();Object.keys(r).forEach(function(e){bs[e]||(bs[e]=[]),bs[e].push(r[e])})}e.provides&&e.provides(xs)}),n}function ws(e,t){var n=[...arguments].slice(2);return(bs[e]||[]).forEach(function(e){t=e.apply(null,[t].concat(n))}),t}function Ts(e){var t=[...arguments].slice(1);(bs[e]||[]).forEach(function(e){e.apply(null,t)})}function Es(){var e=arguments[0],t=Array.prototype.slice.call(arguments,1);return xs[e]?xs[e].apply(null,t):void 0}function Ds(e){e.prefix===`fa`&&(e.prefix=`fas`);var t=e.iconName,n=e.prefix||X();if(t)return t=is(n,t)||t,Lo(Os.definitions,n,t)||Lo(Y.styles,n,t)}var Os=new vs,Z={noAuto:function(){G.autoReplaceSvg=!1,G.observeMutations=!1,Ts(`noAuto`)},config:G,dom:{i2svg:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return H?(Ts(`beforeI2svg`,e),Es(`pseudoElements2svg`,e),Es(`i2svg`,e)):Promise.reject(Error(`Operation requires a DOM of some kind.`))},watch:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=e.autoReplaceSvgRoot;G.autoReplaceSvg===!1&&(G.autoReplaceSvg=!0),G.observeMutations=!0,Fo(function(){ks({autoReplaceSvgRoot:t}),Ts(`watch`,e)})}},parse:{icon:function(e){if(e===null)return null;if(ei(e)===`object`&&e.prefix&&e.iconName)return{prefix:e.prefix,iconName:is(e.prefix,e.iconName)||e.iconName};if(Array.isArray(e)&&e.length===2){var t=e[1].indexOf(`fa-`)===0?e[1].slice(3):e[1],n=ls(e[0]);return{prefix:n,iconName:is(n,t)||t}}if(typeof e==`string`&&(e.indexOf(`${G.cssPrefix}-`)>-1||e.match(no))){var r=ps(e.split(` `),{skipLookups:!0});return{prefix:r.prefix||X(),iconName:is(r.prefix,r.iconName)||r.iconName}}if(typeof e==`string`){var i=X();return{prefix:i,iconName:is(i,e)||e}}}},library:Os,findIconDefinition:Ds,toHtml:Io},ks=function(){var e=(arguments.length>0&&arguments[0]!==void 0?arguments[0]:{}).autoReplaceSvgRoot,t=e===void 0?V:e;(Object.keys(Y.styles).length>0||G.autoFetchSvg)&&H&&G.autoReplaceSvg&&Z.dom.i2svg({node:t})};function As(e,t){return Object.defineProperty(e,"abstract",{get:t}),Object.defineProperty(e,"html",{get:function(){return e.abstract.map(function(e){return Io(e)})}}),Object.defineProperty(e,"node",{get:function(){if(H){var t=V.createElement(`div`);return t.innerHTML=e.html,t.children}}}),e}function js(e){var t=e.children,n=e.main,r=e.mask,i=e.attributes,a=e.styles,o=e.transform;if(wo(o)&&n.found&&!r.found){var s={x:n.width/n.height/2,y:.5};i.style=Co(R(R({},a),{},{"transform-origin":`${s.x+o.x/16}em ${s.y+o.y/16}em`}))}return[{tag:`svg`,attributes:i,children:t}]}function Ms(e){var t=e.prefix,n=e.iconName,r=e.children,i=e.attributes,a=e.symbol,o=a===!0?`${t}-${G.cssPrefix}-${n}`:a;return[{tag:`svg`,attributes:{style:`display: none;`},children:[{tag:`symbol`,attributes:R(R({},i),{},{id:o}),children:r}]}]}function Ns(e){return[`aria-label`,`aria-labelledby`,`title`,`role`].some(function(t){return t in e})}function Ps(e){var t=e.icons,n=t.main,r=t.mask,i=e.prefix,a=e.iconName,o=e.transform,s=e.symbol,c=e.maskId,l=e.extra,u=e.watchable,d=u!==void 0&&u,f=r.found?r:n,p=f.width,m=f.height,h=[G.replacementClass,a?`${G.cssPrefix}-${a}`:``].filter(function(e){return l.classes.indexOf(e)===-1}).filter(function(e){return e!==``||!!e}).concat(l.classes).join(` `),g={children:[],attributes:R(R({},l.attributes),{},{"data-prefix":i,"data-icon":a,class:h,role:l.attributes.role||`img`,viewBox:`0 0 ${p} ${m}`})};!Ns(l.attributes)&&!l.attributes[`aria-hidden`]&&(g.attributes[`aria-hidden`]=`true`),d&&(g.attributes[Ra]=``);var _=R(R({},g),{},{prefix:i,iconName:a,main:n,mask:r,maskId:c,transform:o,symbol:s,styles:R({},l.styles)}),v=r.found&&n.found?Es(`generateAbstractMask`,_)||{children:[],attributes:{}}:Es(`generateAbstractIcon`,_)||{children:[],attributes:{}},y=v.children,b=v.attributes;return _.children=y,_.attributes=b,s?Ms(_):js(_)}function Fs(e){var t=e.content,n=e.width,r=e.height,i=e.transform,a=e.extra,o=e.watchable,s=o!==void 0&&o,c=R(R({},a.attributes),{},{class:a.classes.join(` `)});s&&(c[Ra]=``);var l=R({},a.styles);wo(i)&&(l.transform=Eo({transform:i,startCentered:!0,width:n,height:r}),l[`-webkit-transform`]=l.transform);var u=Co(l);u.length>0&&(c.style=u);var d=[];return d.push({tag:`span`,attributes:c,children:[t]}),d}function Is(e){var t=e.content,n=e.extra,r=R(R({},n.attributes),{},{class:n.classes.join(` `)}),i=Co(n.styles);i.length>0&&(r.style=i);var a=[];return a.push({tag:`span`,attributes:r,children:[t]}),a}var Ls=Y.styles;function Rs(e){var t=e[0],n=e[1],r=Zr(e.slice(4),1)[0],i=null;return i=Array.isArray(r)?{tag:`g`,attributes:{class:`${G.cssPrefix}-${oo.GROUP}`},children:[{tag:`path`,attributes:{class:`${G.cssPrefix}-${oo.SECONDARY}`,fill:`currentColor`,d:r[0]}},{tag:`path`,attributes:{class:`${G.cssPrefix}-${oo.PRIMARY}`,fill:`currentColor`,d:r[1]}}]}:{tag:`path`,attributes:{fill:`currentColor`,d:r}},{found:!0,width:t,height:n,icon:i}}var zs={found:!1,width:512,height:512};function Bs(e,t){!qa&&!G.showMissingIcons&&e&&console.error(`Icon with name "${e}" and prefix "${t}" is missing.`)}function Vs(e,t){var n=t;return t===`fa`&&G.styleDefault!==null&&(t=X()),new Promise(function(r,i){if(n===`fa`){var a=as(e)||{};e=a.iconName||e,t=a.prefix||t}if(e&&t&&Ls[t]&&Ls[t][e]){var o=Ls[t][e];return r(Rs(o))}Bs(e,t),r(R(R({},zs),{},{icon:G.showMissingIcons&&e&&Es(`missingIconAbstract`)||{}}))})}var Hs=function(){},Us=G.measurePerformance&&ui&&ui.mark&&ui.measure?ui:{mark:Hs,measure:Hs},Ws=`FA "7.3.1"`,Gs=function(e){return Us.mark(`${Ws} ${e} begins`),function(){return Ks(e)}},Ks=function(e){Us.mark(`${Ws} ${e} ends`),Us.measure(`${Ws} ${e}`,`${Ws} ${e} begins`,`${Ws} ${e} ends`)},qs={begin:Gs,end:Ks},Js=function(){};function Ys(e){return typeof(e.getAttribute?e.getAttribute(Ra):null)==`string`}function Xs(e){var t=e.getAttribute?e.getAttribute(Va):null,n=e.getAttribute?e.getAttribute(Ha):null;return t&&n}function Zs(e){return e&&e.classList&&e.classList.contains&&e.classList.contains(G.replacementClass)}function Qs(){return G.autoReplaceSvg===!0?rc.replace:rc[G.autoReplaceSvg]||rc.replace}function $s(e){return V.createElementNS(`http://www.w3.org/2000/svg`,e)}function ec(e){return V.createElement(e)}function tc(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).ceFn,n=t===void 0?e.tag===`svg`?$s:ec:t;if(typeof e==`string`)return V.createTextNode(e);var r=n(e.tag);return Object.keys(e.attributes||[]).forEach(function(t){r.setAttribute(t,e.attributes[t])}),(e.children||[]).forEach(function(e){r.appendChild(tc(e,{ceFn:n}))}),r}function nc(e){var t=` ${e.outerHTML} `;return t=`${t}Font Awesome fontawesome.com `,t}var rc={replace:function(e){var t=e[0];if(t.parentNode){if(e[1].forEach(function(e){t.parentNode.insertBefore(tc(e),t)}),t.getAttribute(Ra)===null&&G.keepOriginalSource){var n=V.createComment(nc(t));t.parentNode.replaceChild(n,t)}else t.remove()}},nest:function(e){var t=e[0],n=e[1];if(~bo(t).indexOf(G.replacementClass))return rc.replace(e);var r=RegExp(`${G.cssPrefix}-.*`);if(delete n[0].attributes.id,n[0].attributes.class){var i=n[0].attributes.class.split(` `).reduce(function(e,t){return t===G.replacementClass||t.match(r)?e.toSvg.push(t):e.toNode.push(t),e},{toNode:[],toSvg:[]});n[0].attributes.class=i.toSvg.join(` `),i.toNode.length===0?t.removeAttribute(`class`):t.setAttribute(`class`,i.toNode.join(` `))}var a=n.map(function(e){return Io(e)}).join(`
`);t.setAttribute(Ra,``),t.innerHTML=a}};function ic(e){e()}function ac(e,t){var n=typeof t==`function`?t:Js;if(e.length===0)n();else{var r=ic;G.mutateApproach===Wa&&(r=B.requestAnimationFrame||ic),r(function(){var t=Qs(),r=qs.begin(`mutate`);e.map(t),r(),n()})}}var oc=!1;function sc(){oc=!0}function cc(){oc=!1}var lc=null;function uc(e){if(li&&G.observeMutations){var t=e.treeCallback,n=t===void 0?Js:t,r=e.nodeCallback,i=r===void 0?Js:r,a=e.pseudoElementsCallback,o=a===void 0?Js:a,s=e.observeMutationsRoot,c=s===void 0?V:s;lc=new li(function(e){if(!oc){var t=X();yo(e).forEach(function(e){if(e.type===`childList`&&e.addedNodes.length>0&&!Ys(e.addedNodes[0])&&(G.searchPseudoElements&&o(e.target),n(e.target)),e.type===`attributes`&&e.target.parentNode&&G.searchPseudoElements&&o([e.target],!0),e.type===`attributes`&&Ys(e.target)&&~ao.indexOf(e.attributeName)){if(e.attributeName===`class`&&Xs(e.target)){var r=ps(bo(e.target)),a=r.prefix,s=r.iconName;e.target.setAttribute(Va,a||t),s&&e.target.setAttribute(Ha,s)}else Zs(e.target)&&i(e.target)}})}}),H&&lc.observe(c,{childList:!0,attributes:!0,characterData:!0,subtree:!0})}}function dc(){lc&&lc.disconnect()}function fc(e){var t=e.getAttribute(`style`),n=[];return t&&(n=t.split(`;`).reduce(function(e,t){var n=t.split(`:`),r=n[0],i=n.slice(1);return r&&i.length>0&&(e[r]=i.join(`:`).trim()),e},{})),n}function pc(e){var t=e.getAttribute(`data-prefix`),n=e.getAttribute(`data-icon`),r=e.innerText===void 0?``:e.innerText.trim(),i=ps(bo(e));return i.prefix||=X(),t&&n&&(i.prefix=t,i.iconName=n),i.iconName&&i.prefix?i:(i.prefix&&r.length>0&&(i.iconName=rs(i.prefix,e.innerText)||ns(i.prefix,Bo(e.innerText))),!i.iconName&&G.autoFetchSvg&&e.firstChild&&e.firstChild.nodeType===Node.TEXT_NODE&&(i.iconName=e.firstChild.data),i)}function mc(e){return yo(e.attributes).reduce(function(e,t){return e.name!==`class`&&e.name!==`style`&&(e[t.name]=t.value),e},{})}function hc(){return{iconName:null,prefix:null,transform:q,symbol:!1,mask:{iconName:null,prefix:null,rest:[]},maskId:null,extra:{classes:[],styles:{},attributes:{}}}}function gc(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{styleParser:!0},n=pc(e),r=n.iconName,i=n.prefix,a=n.rest,o=mc(e),s=ws(`parseNodeAttributes`,{},e);return R({iconName:r,prefix:i,transform:q,mask:{iconName:null,prefix:null,rest:[]},maskId:null,symbol:!1,extra:{classes:a,styles:t.styleParser?fc(e):[],attributes:o}},s)}var _c=Y.styles;function vc(e){var t=G.autoReplaceSvg===`nest`?gc(e,{styleParser:!1}):gc(e);return~t.extra.classes.indexOf(ro)?Es(`generateLayersText`,e,t):Es(`generateSvgReplacementMutation`,e,t)}function yc(){return[].concat(z(ga),z(ka))}function bc(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;if(!H)return Promise.resolve();var n=V.documentElement.classList,r=function(e){return n.add(`${Ua}-${e}`)},i=function(e){return n.remove(`${Ua}-${e}`)},a=G.autoFetchSvg?yc():_i.concat(Object.keys(_c));a.includes(`fa`)||a.push(`fa`);var o=[`.${ro}:not([${Ra}])`].concat(a.map(function(e){return`.${e}:not([${Ra}])`})).join(`, `);if(o.length===0)return Promise.resolve();var s=[];try{s=yo(e.querySelectorAll(o))}catch{}if(s.length>0)r(`pending`),i(`complete`);else return Promise.resolve();var c=qs.begin(`onTree`),l=s.reduce(function(e,t){try{var n=vc(t);n&&e.push(n)}catch(e){qa||e.name===`MissingIcon`&&console.error(e)}return e},[]);return new Promise(function(e,n){Promise.all(l).then(function(n){ac(n,function(){r(`active`),r(`complete`),i(`pending`),typeof t==`function`&&t(),c(),e()})}).catch(function(e){c(),n(e)})})}function xc(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;vc(e).then(function(e){e&&ac([e],t)})}function Sc(e){return function(t){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},r=(t||{}).icon?t:Ds(t||{}),i=n.mask;return i&&=(i||{}).icon?i:Ds(i||{}),e(r,R(R({},n),{},{mask:i}))}}var Cc=function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?q:n,i=t.symbol,a=i!==void 0&&i,o=t.mask,s=o===void 0?null:o,c=t.maskId,l=c===void 0?null:c,u=t.classes,d=u===void 0?[]:u,f=t.attributes,p=f===void 0?{}:f,m=t.styles,h=m===void 0?{}:m;if(e){var g=e.prefix,_=e.iconName,v=e.icon;return As(R({type:`icon`},e),function(){return Ts(`beforeDOMElementCreation`,{iconDefinition:e,params:t}),Ps({icons:{main:Rs(v),mask:s?Rs(s.icon):{found:!1,width:null,height:null,icon:{}}},prefix:g,iconName:_,transform:R(R({},q),r),symbol:a,maskId:l,extra:{attributes:p,styles:h,classes:d}})})}},wc={mixout:function(){return{icon:Sc(Cc)}},hooks:function(){return{mutationObserverCallbacks:function(e){return e.treeCallback=bc,e.nodeCallback=xc,e}}},provides:function(e){e.i2svg=function(e){var t=e.node,n=t===void 0?V:t,r=e.callback;return bc(n,r===void 0?function(){}:r)},e.generateSvgReplacementMutation=function(e,t){var n=t.iconName,r=t.prefix,i=t.transform,a=t.symbol,o=t.mask,s=t.maskId,c=t.extra;return new Promise(function(t,l){Promise.all([Vs(n,r),o.iconName?Vs(o.iconName,o.prefix):Promise.resolve({found:!1,width:512,height:512,icon:{}})]).then(function(o){var l=Zr(o,2),u=l[0],d=l[1];t([e,Ps({icons:{main:u,mask:d},prefix:r,iconName:n,transform:i,symbol:a,maskId:s,extra:c,watchable:!0})])}).catch(l)})},e.generateAbstractIcon=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.transform,a=e.styles,o=Co(a);o.length>0&&(n.style=o);var s;return wo(i)&&(s=Es(`generateAbstractTransformGrouping`,{main:r,transform:i,containerWidth:r.width,iconWidth:r.width})),t.push(s||r.icon),{children:t,attributes:n}}}},Tc={mixout:function(){return{layer:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.classes,r=n===void 0?[]:n;return As({type:`layer`},function(){Ts(`beforeDOMElementCreation`,{assembler:e,params:t});var n=[];return e(function(e){Array.isArray(e)?e.map(function(e){n=n.concat(e.abstract)}):n=n.concat(e.abstract)}),[{tag:`span`,attributes:{class:[`${G.cssPrefix}-layers`].concat(z(r)).join(` `)},children:n}]})}}}},Ec={mixout:function(){return{counter:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.title,r=n===void 0?null:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return As({type:`counter`,content:e},function(){return Ts(`beforeDOMElementCreation`,{content:e,params:t}),Is({content:e.toString(),title:r,extra:{attributes:s,styles:l,classes:[`${G.cssPrefix}-layers-counter`].concat(z(a))}})})}}}},Dc={mixout:function(){return{text:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?q:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return As({type:`text`,content:e},function(){return Ts(`beforeDOMElementCreation`,{content:e,params:t}),Fs({content:e,transform:R(R({},q),r),extra:{attributes:s,styles:l,classes:[`${G.cssPrefix}-layers-text`].concat(z(a))}})})}}},provides:function(e){e.generateLayersText=function(e,t){var n=t.transform,r=t.extra,i=null,a=null;if(di){var o=parseInt(getComputedStyle(e).fontSize,10),s=e.getBoundingClientRect();i=s.width/o,a=s.height/o}return Promise.resolve([e,Fs({content:e.innerHTML,width:i,height:a,transform:n,extra:r,watchable:!0})])}}},Oc=RegExp(`"`,`ug`),kc=[1105920,1112319],Ac=R(R(R(R({},{FontAwesome:{normal:`fas`,400:`fas`}}),pa),Pa),ba),jc=Object.keys(Ac).reduce(function(e,t){return e[t.toLowerCase()]=Ac[t],e},{}),Mc=Object.keys(jc).reduce(function(e,t){var n=jc[t];return e[t]=n[900]||z(Object.entries(n))[0][1],e},{});function Nc(e){return Bo(z(e.replace(Oc,``))[0]||``)}function Pc(e){var t=e.getPropertyValue(`font-feature-settings`).includes(`ss01`),n=e.getPropertyValue(`content`).replace(Oc,``),r=n.codePointAt(0),i=r>=kc[0]&&r<=kc[1],a=n.length===2&&n[0]===n[1];return i||a||t}function Fc(e,t){var n=e.replace(/^['"]|['"]$/g,``).toLowerCase(),r=parseInt(t),i=isNaN(r)?`normal`:r;return(jc[n]||{})[i]||Mc[n]}function Ic(e,t){var n=`${Ba}${t.replace(`:`,`-`)}`;return new Promise(function(r,i){if(e.getAttribute(n)!==null)return r();var a=yo(e.children).filter(function(e){return e.getAttribute(za)===t})[0],o=B.getComputedStyle(e,t),s=o.getPropertyValue(`font-family`),c=s.match(io),l=o.getPropertyValue(`font-weight`),u=o.getPropertyValue(`content`);if(a&&!c)return e.removeChild(a),r();if(c&&u!==`none`&&u!==``){var d=o.getPropertyValue(`content`),f=Fc(s,l),p=Nc(d),m=c[0].startsWith(`FontAwesome`),h=Pc(o),g=ns(f,p),_=g;if(m){var v=os(p);v.iconName&&v.prefix&&(g=v.iconName,f=v.prefix)}if(g&&!h&&(!a||a.getAttribute(Va)!==f||a.getAttribute(Ha)!==_)){e.setAttribute(n,_),a&&e.removeChild(a);var y=hc(),b=y.extra;b.attributes[za]=t,Vs(g,f).then(function(i){var a=Ps(R(R({},y),{},{icons:{main:i,mask:ss()},prefix:f,iconName:_,extra:b,watchable:!0})),o=V.createElementNS(`http://www.w3.org/2000/svg`,`svg`);t===`::before`?e.insertBefore(o,e.firstChild):e.appendChild(o),o.outerHTML=a.map(function(e){return Io(e)}).join(`
`),e.removeAttribute(n),r()}).catch(i)}else r()}else r()})}function Lc(e){return Promise.all([Ic(e,`::before`),Ic(e,`::after`)])}function Rc(e){return e.parentNode!==document.head&&!~Ga.indexOf(e.tagName.toUpperCase())&&!e.getAttribute(za)&&(!e.parentNode||e.parentNode.tagName!==`svg`)}var zc=function(e){return!!e&&Ka.some(function(t){return e.includes(t)})},Bc=function(e){if(!e)return[];var t=new Set,n=e.split(/,(?![^()]*\))/).map(function(e){return e.trim()});n=n.flatMap(function(e){return e.includes(`(`)?e:e.split(`,`).map(function(e){return e.trim()})});var r=Gr(n),i;try{for(r.s();!(i=r.n()).done;){var a=i.value;if(zc(a)){var o=Ka.reduce(function(e,t){return e.replace(t,``)},a);o!==``&&o!==`*`&&t.add(o)}}}catch(e){r.e(e)}finally{r.f()}return t};function Vc(e){var t=arguments.length>1&&arguments[1]!==void 0&&arguments[1];if(H){var n;if(t)n=e;else if(G.searchPseudoElementsFullScan)n=e.querySelectorAll(`*`);else{var r=new Set,i=Gr(document.styleSheets),a;try{for(i.s();!(a=i.n()).done;){var o=a.value;try{var s=Gr(o.cssRules),c;try{for(s.s();!(c=s.n()).done;){var l=c.value,u=Gr(Bc(l.selectorText)),d;try{for(u.s();!(d=u.n()).done;){var f=d.value;r.add(f)}}catch(e){u.e(e)}finally{u.f()}}}catch(e){s.e(e)}finally{s.f()}}catch(e){G.searchPseudoElementsWarnings&&console.warn(`Font Awesome: cannot parse stylesheet: ${o.href} (${e.message})
If it declares any Font Awesome CSS pseudo-elements, they will not be rendered as SVG icons. Add crossorigin="anonymous" to the <link>, enable searchPseudoElementsFullScan for slower but more thorough DOM parsing, or suppress this warning by setting searchPseudoElementsWarnings to false.`)}}}catch(e){i.e(e)}finally{i.f()}if(!r.size)return;var p=Array.from(r).join(`, `);try{n=e.querySelectorAll(p)}catch{}}return new Promise(function(e,t){var r=yo(n).filter(Rc).map(Lc),i=qs.begin(`searchPseudoElements`);sc(),Promise.all(r).then(function(){i(),cc(),e()}).catch(function(){i(),cc(),t()})})}}var Hc={hooks:function(){return{mutationObserverCallbacks:function(e){return e.pseudoElementsCallback=Vc,e}}},provides:function(e){e.pseudoElements2svg=function(e){var t=e.node,n=t===void 0?V:t;G.searchPseudoElements&&Vc(n)}}},Uc=!1,Wc={mixout:function(){return{dom:{unwatch:function(){sc(),Uc=!0}}}},hooks:function(){return{bootstrap:function(){uc(ws(`mutationObserverCallbacks`,{}))},noAuto:function(){dc()},watch:function(e){var t=e.observeMutationsRoot;Uc?cc():uc(ws(`mutationObserverCallbacks`,{observeMutationsRoot:t}))}}}},Gc=function(e){return e.toLowerCase().split(` `).reduce(function(e,t){var n=t.toLowerCase().split(`-`),r=n[0],i=n.slice(1).join(`-`);if(r&&i===`h`)return e.flipX=!0,e;if(r&&i===`v`)return e.flipY=!0,e;if(i=parseFloat(i),isNaN(i))return e;switch(r){case`grow`:e.size+=i;break;case`shrink`:e.size-=i;break;case`left`:e.x-=i;break;case`right`:e.x+=i;break;case`up`:e.y-=i;break;case`down`:e.y+=i;break;case`rotate`:e.rotate+=i}return e},{size:16,x:0,y:0,flipX:!1,flipY:!1,rotate:0})},Kc={mixout:function(){return{parse:{transform:function(e){return Gc(e)}}}},hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-transform`);return n&&(e.transform=Gc(n)),e}}},provides:function(e){e.generateAbstractTransformGrouping=function(e){var t=e.main,n=e.transform,r=e.containerWidth,i=e.iconWidth,a={outer:{transform:`translate(${r/2} 256)`},inner:{transform:`${`translate(${n.x*32}, ${n.y*32}) `} ${`scale(${n.size/16*(n.flipX?-1:1)}, ${n.size/16*(n.flipY?-1:1)}) `} ${`rotate(${n.rotate} 0 0)`}`},path:{transform:`translate(${i/2*-1} -256)`}};return{tag:`g`,attributes:R({},a.outer),children:[{tag:`g`,attributes:R({},a.inner),children:[{tag:t.icon.tag,children:t.icon.children,attributes:R(R({},t.icon.attributes),a.path)}]}]}}}},qc={x:0,y:0,width:`100%`,height:`100%`};function Jc(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!0;return e.attributes&&(e.attributes.fill||t)&&(e.attributes.fill=`black`),e}function Yc(e){return e.tag===`g`?e.children:[e]}Cs([jo,wc,Tc,Ec,Dc,Hc,Wc,Kc,{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-mask`),r=n?ps(n.split(` `).map(function(e){return e.trim()})):ss();return r.prefix||=X(),e.mask=r,e.maskId=t.getAttribute(`data-fa-mask-id`),e}}},provides:function(e){e.generateAbstractMask=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.mask,a=e.maskId,o=e.transform,s=r.width,c=r.icon,l=i.width,u=i.icon,d=To({transform:o,containerWidth:l,iconWidth:s}),f={tag:`rect`,attributes:R(R({},qc),{},{fill:`white`})},p=c.children?{children:c.children.map(Jc)}:{},m={tag:`g`,attributes:R({},d.inner),children:[Jc(R({tag:c.tag,attributes:R(R({},c.attributes),d.path)},p))]},h={tag:`g`,attributes:R({},d.outer),children:[m]},g=`mask-${a||vo()}`,_=`clip-${a||vo()}`,v={tag:`mask`,attributes:R(R({},qc),{},{id:g,maskUnits:`userSpaceOnUse`,maskContentUnits:`userSpaceOnUse`}),children:[f,h]},y={tag:`defs`,children:[{tag:`clipPath`,attributes:{id:_},children:Yc(u)},v]};return t.push(y,{tag:`rect`,attributes:R({fill:`currentColor`,"clip-path":`url(#${_})`,mask:`url(#${g})`},qc)}),{children:t,attributes:n}}}},{provides:function(e){var t=!1;B.matchMedia&&(t=B.matchMedia(`(prefers-reduced-motion: reduce)`).matches),e.missingIconAbstract=function(){var e=[],n={fill:`currentColor`},r={attributeType:`XML`,repeatCount:`indefinite`,dur:`2s`};e.push({tag:`path`,attributes:R(R({},n),{},{d:`M156.5,447.7l-12.6,29.5c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7C127.6,430.5,141.5,440,156.5,447.7z M40.6,272H8.5 c1.4,21.2,5.4,41.7,11.7,61.1L50,321.2C45.1,305.5,41.8,289,40.6,272z M40.6,240c1.4-18.8,5.2-37,11.1-54.1l-29.5-12.6 C14.7,194.3,10,216.7,8.5,240H40.6z M64.3,156.5c7.8-14.9,17.2-28.8,28.1-41.5L69.7,92.3c-13.7,15.6-25.5,32.8-34.9,51.5 L64.3,156.5z M397,419.6c-13.9,12-29.4,22.3-46.1,30.4l11.9,29.8c20.7-9.9,39.8-22.6,56.9-37.6L397,419.6z M115,92.4 c13.9-12,29.4-22.3,46.1-30.4l-11.9-29.8c-20.7,9.9-39.8,22.6-56.8,37.6L115,92.4z M447.7,355.5c-7.8,14.9-17.2,28.8-28.1,41.5 l22.7,22.7c13.7-15.6,25.5-32.9,34.9-51.5L447.7,355.5z M471.4,272c-1.4,18.8-5.2,37-11.1,54.1l29.5,12.6 c7.5-21.1,12.2-43.5,13.6-66.8H471.4z M321.2,462c-15.7,5-32.2,8.2-49.2,9.4v32.1c21.2-1.4,41.7-5.4,61.1-11.7L321.2,462z M240,471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6,29.5c21.1,7.5,43.5,12.2,66.8,13.6V471.4z M462,190.8c5,15.7,8.2,32.2,9.4,49.2h32.1 c-1.4-21.2-5.4-41.7-11.7-61.1L462,190.8z M92.4,397c-12-13.9-22.3-29.4-30.4-46.1l-29.8,11.9c9.9,20.7,22.6,39.8,37.6,56.9 L92.4,397z M272,40.6c18.8,1.4,36.9,5.2,54.1,11.1l12.6-29.5C317.7,14.7,295.3,10,272,8.5V40.6z M190.8,50 c15.7-5,32.2-8.2,49.2-9.4V8.5c-21.2,1.4-41.7,5.4-61.1,11.7L190.8,50z M442.3,92.3L419.6,115c12,13.9,22.3,29.4,30.5,46.1 l29.8-11.9C470,128.5,457.3,109.4,442.3,92.3z M397,92.4l22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6,29.5 C370.4,72.1,384.4,81.5,397,92.4z`})});var i=R(R({},r),{},{attributeName:`opacity`}),a={tag:`circle`,attributes:R(R({},n),{},{cx:`256`,cy:`364`,r:`28`}),children:[]};return t||a.children.push({tag:`animate`,attributes:R(R({},r),{},{attributeName:`r`,values:`28;14;28;28;14;28;`})},{tag:`animate`,attributes:R(R({},i),{},{values:`1;0;1;1;0;1;`})}),e.push(a),e.push({tag:`path`,attributes:R(R({},n),{},{opacity:`1`,d:`M263.7,312h-16c-6.6,0-12-5.4-12-12c0-71,77.4-63.9,77.4-107.8c0-20-17.8-40.2-57.4-40.2c-29.1,0-44.3,9.6-59.2,28.7 c-3.9,5-11.1,6-16.2,2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2c21.2-27.2,46.4-44.7,91.2-44.7c52.3,0,97.4,29.8,97.4,80.2 c0,67.6-77.4,63.5-77.4,107.8C275.7,306.6,270.3,312,263.7,312z`}),children:t?[]:[{tag:`animate`,attributes:R(R({},i),{},{values:`1;0;0;0;0;1;`})}]}),t||e.push({tag:`path`,attributes:R(R({},n),{},{opacity:`0`,d:`M232.5,134.5l7,168c0.3,6.4,5.6,11.5,12,11.5h9c6.4,0,11.7-5.1,12-11.5l7-168c0.3-6.8-5.2-12.5-12-12.5h-23 C237.7,122,232.2,127.7,232.5,134.5z`}),children:[{tag:`animate`,attributes:R(R({},i),{},{values:`0;0;1;1;0;0;`})}]}),{tag:`g`,attributes:{class:`missing`},children:e}}}},{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-symbol`);return e.symbol=n===null?!1:n===``||n,e}}}}],{mixoutsTo:Z}),Z.noAuto;var Xc=Z.config;Z.library,Z.dom;var Zc=Z.parse;Z.findIconDefinition,Z.toHtml;var Qc=Z.icon;Z.layer,Z.text,Z.counter;function $c(e){return e-=0,e===e}function el(e){return $c(e)?e:(e=e.replace(/[_-]+(.)?/g,(e,t)=>t?t.toUpperCase():``),e.charAt(0).toLowerCase()+e.slice(1))}var tl=(e,t)=>M.createElement(`stop`,{key:`${t}-${e.offset}`,offset:e.offset,stopColor:e.color,...e.opacity!==void 0&&{stopOpacity:e.opacity}});function nl(e){return e.charAt(0).toUpperCase()+e.slice(1)}var rl=new Map,il=1e3;function al(e){if(rl.has(e))return rl.get(e);let t={},n=0,r=e.length;for(;n<r;){let i=e.indexOf(`;`,n),a=i===-1?r:i,o=e.slice(n,a).trim();if(o){let e=o.indexOf(`:`);if(e>0){let n=o.slice(0,e).trim(),r=o.slice(e+1).trim();if(n&&r){let e=el(n);t[e.startsWith(`webkit`)?nl(e):e]=r}}}n=a+1}if(rl.size===il){let e=rl.keys().next().value;e&&rl.delete(e)}return rl.set(e,t),t}function ol(e,t,n={}){if(typeof t==`string`)return t;let r=(t.children||[]).map(t=>{let r=t;return(`fill`in n||n.gradientFill)&&t.tag===`path`&&`fill`in t.attributes&&(r={...t,attributes:{...t.attributes,fill:void 0}}),ol(e,r)}),i=t.attributes||{},a={};for(let[e,t]of Object.entries(i))switch(!0){case e===`class`:a.className=t;break;case e===`style`:a.style=al(String(t));break;case e.startsWith(`aria-`):case e.startsWith(`data-`):a[e.toLowerCase()]=t;break;default:a[el(e)]=t}let{style:o,role:s,"aria-label":c,gradientFill:l,...u}=n;if(o&&(a.style=a.style?{...a.style,...o}:o),s&&(a.role=s),c&&(a[`aria-label`]=c,a[`aria-hidden`]=`false`),l){a.fill=`url(#${l.id})`;let{type:t,stops:n=[],...i}=l;r.unshift(e(t===`linear`?`linearGradient`:`radialGradient`,{...i,id:l.id},n.map(tl)))}return e(t.tag,{...a,...u},...r)}var sl=ol.bind(null,M.createElement),cl=(e,t)=>{let n=(0,M.useId)();return e||(t?n:void 0)},ll=class{constructor(e=`react-fontawesome`){this.enabled=!1;let t=!1;try{t=typeof process<`u`&&!1}catch{}this.scope=e,this.enabled=t}log(...e){this.enabled&&console.log(`[${this.scope}]`,...e)}warn(...e){this.enabled&&console.warn(`[${this.scope}]`,...e)}error(...e){this.enabled&&console.error(`[${this.scope}]`,...e)}};typeof process<`u`&&{}.FA_VERSION;var ul=`searchPseudoElementsFullScan`in Xc&&typeof Xc.searchPseudoElementsFullScan==`boolean`?`7.0.0`:`6.0.0`,dl=Number.parseInt(ul)>=7,fl=()=>dl,pl=`fa`,Q={beat:`fa-beat`,fade:`fa-fade`,beatFade:`fa-beat-fade`,bounce:`fa-bounce`,shake:`fa-shake`,spin:`fa-spin`,spinPulse:`fa-spin-pulse`,spinReverse:`fa-spin-reverse`,pulse:`fa-pulse`,flip360:`fa-flip-360`,buzz:`fa-buzz`,float:`fa-float`,jello:`fa-jello`,spinSnap:`fa-spin-snap`,spinSnap4:`fa-spin-snap-4`,spinSnap8:`fa-spin-snap-8`,swing:`fa-swing`,wag:`fa-wag`},ml={left:`fa-pull-left`,right:`fa-pull-right`},hl={90:`fa-rotate-90`,180:`fa-rotate-180`,270:`fa-rotate-270`},gl={"2xs":`fa-2xs`,xs:`fa-xs`,sm:`fa-sm`,lg:`fa-lg`,xl:`fa-xl`,"2xl":`fa-2xl`,"1x":`fa-1x`,"2x":`fa-2x`,"3x":`fa-3x`,"4x":`fa-4x`,"5x":`fa-5x`,"6x":`fa-6x`,"7x":`fa-7x`,"8x":`fa-8x`,"9x":`fa-9x`,"10x":`fa-10x`},$={border:`fa-border`,fixedWidth:`fa-fw`,flip:`fa-flip`,flipHorizontal:`fa-flip-horizontal`,flipVertical:`fa-flip-vertical`,inverse:`fa-inverse`,rotateBy:`fa-rotate-by`,swapOpacity:`fa-swap-opacity`,widthAuto:`fa-width-auto`,canvasSquare:`fa-canvas-square`,canvasRoomy:`fa-canvas-roomy`},_l={default:`fa-layers`};function vl(e){let t=Xc.cssPrefix||Xc.familyPrefix||pl;return t===pl?e:e.replace(new RegExp(String.raw`(?<=^|\s)${pl}-`,`g`),`${t}-`)}function yl(e){let{beat:t,fade:n,beatFade:r,bounce:i,shake:a,spin:o,spinPulse:s,spinReverse:c,pulse:l,fixedWidth:u,inverse:d,border:f,flip:p,size:m,rotation:h,pull:g,swapOpacity:_,rotateBy:v,widthAuto:y,canvasSquare:b,canvasRoomy:x,flip360:S,buzz:C,float:ee,jello:te,spinSnap:ne,spinSnap4:re,spinSnap8:ie,swing:w,wag:ae,className:oe}=e,T=[];return oe&&T.push(...oe.split(` `)),t&&T.push(Q.beat),n&&T.push(Q.fade),r&&T.push(Q.beatFade),i&&T.push(Q.bounce),a&&T.push(Q.shake),o&&T.push(Q.spin),c&&T.push(Q.spinReverse),s&&T.push(Q.spinPulse),l&&T.push(Q.pulse),u&&T.push($.fixedWidth),d&&T.push($.inverse),f&&T.push($.border),p===!0&&T.push($.flip),(p===`horizontal`||p===`both`)&&T.push($.flipHorizontal),(p===`vertical`||p===`both`)&&T.push($.flipVertical),m!=null&&T.push(gl[m]),h!=null&&h!==0&&T.push(hl[h]),g!=null&&T.push(ml[g]),_&&T.push($.swapOpacity),fl()?(v&&T.push($.rotateBy),y&&T.push($.widthAuto),b&&T.push($.canvasSquare),x&&T.push($.canvasRoomy),S&&T.push(Q.flip360),C&&T.push(Q.buzz),ee&&T.push(Q.float),te&&T.push(Q.jello),ne&&T.push(Q.spinSnap),re&&T.push(Q.spinSnap4),ie&&T.push(Q.spinSnap8),w&&T.push(Q.swing),ae&&T.push(Q.wag),(Xc.cssPrefix||Xc.familyPrefix||pl)===pl?T:T.map(vl)):T}var bl=e=>typeof e==`object`&&`icon`in e&&!!e.icon;function xl(e){if(e)return bl(e)?e:Zc.icon(e)}function Sl(e){return Object.keys(e)}var Cl=new ll(`FontAwesomeIcon`),wl={border:!1,className:``,mask:void 0,maskId:void 0,fixedWidth:!1,inverse:!1,flip:!1,icon:void 0,listItem:!1,pull:void 0,pulse:!1,rotation:void 0,rotateBy:!1,size:void 0,spin:!1,spinPulse:!1,spinReverse:!1,beat:!1,fade:!1,beatFade:!1,bounce:!1,shake:!1,symbol:!1,title:``,titleId:void 0,transform:void 0,swapOpacity:!1,widthAuto:!1,canvasSquare:!1,canvasRoomy:!1,flip360:!1,buzz:!1,float:!1,jello:!1,spinSnap:!1,spinSnap4:!1,spinSnap8:!1,swing:!1,wag:!1},Tl=new Set(Object.keys(wl)),El=M.forwardRef((e,t)=>{let n={...wl,...e},{icon:r,mask:i,symbol:a,title:o,titleId:s,maskId:c,transform:l}=n,u=cl(c,!!i),d=cl(s,!!o),f=xl(r);if(!f)return Cl.error(`Icon lookup is undefined`,r),null;let p=yl(n),m=typeof l==`string`?Zc.transform(l):l,h=xl(i),g=Qc(f,{...p.length>0&&{classes:p},...m&&{transform:m},...h&&{mask:h},symbol:a,title:o,titleId:d,maskId:u});if(!g)return Cl.error(`Could not find icon`,f),null;let{abstract:_}=g,v={ref:t};for(let e of Sl(n))Tl.has(e)||(v[e]=n[e]);return sl(_[0],v)});El.displayName=`FontAwesomeIcon`,`${_l.default}${$.fixedWidth}`;var Dl={prefix:`fas`,iconName:`tower-broadcast`,icon:[576,512,[`broadcast-tower`],`f519`,`M87.9 11.5c-11.3-6.9-26.1-3.2-33 8.1-24.8 41-39 89.1-39 140.4s14.2 99.4 39 140.4c6.9 11.3 21.6 15 33 8.1s15-21.6 8.1-33C75.7 241.9 64 202.3 64 160S75.7 78.1 96.1 44.4c6.9-11.3 3.2-26.1-8.1-33zm400.1 0c-11.3 6.9-15 21.6-8.1 33 20.4 33.7 32.1 73.3 32.1 115.6s-11.7 81.9-32.1 115.6c-6.9 11.3-3.2 26.1 8.1 33s26.1 3.2 33-8.1c24.8-41 39-89.1 39-140.4S545.8 60.6 521 19.6c-6.9-11.3-21.6-15-33-8.1zM320 215.4c19.1-11.1 32-31.7 32-55.4 0-35.3-28.7-64-64-64s-64 28.7-64 64c0 23.7 12.9 44.4 32 55.4L256 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-264.6zM180.2 91c7.2-11.2 3.9-26-7.2-33.2s-26-3.9-33.2 7.2c-17.6 27.4-27.8 60-27.8 95s10.2 67.6 27.8 95c7.2 11.2 22 14.4 33.2 7.2s14.4-22 7.2-33.2c-12.8-19.9-20.2-43.6-20.2-69s7.4-49.1 20.2-69zM436.2 65c-7.2-11.2-22-14.4-33.2-7.2s-14.4 22-7.2 33.2c12.8 19.9 20.2 43.6 20.2 69s-7.4 49.1-20.2 69c-7.2 11.2-3.9 26 7.2 33.2s26 3.9 33.2-7.2c17.6-27.4 27.8-60 27.8-95s-10.2-67.6-27.8-95z`]},Ol=[`#2f6fe0`,`#f28c28`,`#27a845`,`#8b5a2b`,`#8a97a8`,`#e9eef5`,`#d93636`,`#3b4250`];function kl({className:e}){let t=Ol.length;return(0,P.jsx)(`svg`,{className:j(`fiber-field`,e),viewBox:`0 0 1000 800`,preserveAspectRatio:`none`,"aria-hidden":!0,children:Ol.map((e,n)=>{let r=70+n*660/(t-1),i=`M -20 ${r} C 380 ${r}, 620 ${400+(r-400)*.22}, 1010 ${400+(r-400)*.04}`;return(0,P.jsxs)(`g`,{children:[(0,P.jsx)(`path`,{d:i,className:`fiber-core`,stroke:e}),(0,P.jsx)(`path`,{d:i,className:`fiber-light`,style:{animationDelay:`${n*.9%6.3}s`,animationDuration:`${6+n%3}s`}})]},e)})})}function Al({brandName:e,logoUrl:t,size:n=`lg`}){return(0,P.jsx)(`div`,{className:j(`rounded-xl flex items-center justify-center overflow-hidden border border-brd shrink-0`,n===`lg`?`w-11 h-11`:`w-10 h-10`,t?`bg-white p-1.5`:`bg-accent/10`),children:t?(0,P.jsx)(`img`,{src:t,alt:e,className:`w-full h-full object-contain`}):(0,P.jsx)(El,{icon:Dl,className:`text-accent`,style:{fontSize:n===`lg`?20:18}})})}function jl({children:e,brandName:t,logoUrl:n}){let{t:r}=N();return(0,P.jsxs)(`div`,{className:`auth-shell min-h-screen relative overflow-hidden bg-[var(--bg-primary)] text-tx1`,children:[(0,P.jsx)(kl,{className:`hidden lg:block`}),(0,P.jsx)(kl,{className:`lg:hidden fiber-field-mobile`}),(0,P.jsxs)(`div`,{className:`relative z-10 min-h-screen grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]`,children:[(0,P.jsxs)(`div`,{className:`hidden lg:flex flex-col justify-between p-12`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-3`,children:[(0,P.jsx)(Al,{brandName:t,logoUrl:n}),(0,P.jsxs)(`div`,{children:[(0,P.jsx)(`div`,{className:`text-lg font-bold font-display tracking-tight`,children:t}),(0,P.jsx)(`div`,{className:`text-xs text-tx3`,children:r(`login.tagline`)})]})]}),(0,P.jsxs)(`div`,{className:`auth-copy max-w-lg`,children:[(0,P.jsx)(`h1`,{className:`auth-hero font-display`,children:r(`login.hero`)}),(0,P.jsx)(`p`,{className:`text-base text-tx2 leading-relaxed mt-4 max-w-md`,children:r(`login.heroSub`)})]}),(0,P.jsxs)(`div`,{className:`flex items-center gap-2 text-xs text-tx3`,children:[(0,P.jsx)(`span`,{className:`live-pulse-dot`,"aria-hidden":!0}),(0,P.jsx)(`span`,{children:r(`login.footerReady`)})]})]}),(0,P.jsxs)(`div`,{className:`flex flex-col items-center justify-center p-4 sm:p-6 md:p-10`,children:[(0,P.jsxs)(`div`,{className:`lg:hidden flex flex-col items-center gap-2 mb-8 mt-6`,children:[(0,P.jsx)(Al,{brandName:t,logoUrl:n,size:`sm`}),(0,P.jsx)(`div`,{className:`text-base font-bold font-display`,children:t}),(0,P.jsx)(`div`,{className:`text-xs text-tx3 text-center max-w-xs`,children:r(`login.tagline`)})]}),(0,P.jsx)(`div`,{className:`auth-panel relative w-full max-w-sm`,children:e})]})]})]})}function Ml(){let{t:e}=N(),[t,n]=(0,M.useState)(``),[r,i]=(0,M.useState)(``),[a,o]=(0,M.useState)(!1),[s,c]=(0,M.useState)(!1),[l,u]=(0,M.useState)(!1),{login:d,user:f,loading:m}=I(),h=ke(),[g,v]=(0,M.useState)(``),[y,b]=(0,M.useState)(null),[x,S]=(0,M.useState)(!1),[C,ee]=(0,M.useState)(``),[te,ne]=(0,M.useState)(!1),[re,ie]=(0,M.useState)(!1),w=window.location.hostname===`nms.salfa.my.id`||window.location.hostname===`localhost`||window.location.hostname===`127.0.0.1`;return(0,M.useEffect)(()=>{fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{v(e.nms_name||`FiberNMS`),b(e.logo_url||null)}).catch(()=>{v(`FiberNMS`)})},[]),m?null:f?(0,P.jsx)(Oe,{to:`/dashboard`,replace:!0}):(0,P.jsxs)(jl,{brandName:g,logoUrl:y,children:[(0,P.jsxs)(dn,{bodyClassName:`p-6 sm:p-8`,children:[(0,P.jsx)(`h2`,{className:`text-2xl font-semibold mb-1 font-display`,children:e(`login.signIn`)}),(0,P.jsx)(`p`,{className:`text-sm text-tx3 mb-6`,children:e(`login.subtitle`)}),(0,P.jsxs)(`form`,{onSubmit:async n=>{if(n.preventDefault(),c(!0),await d(t,r)){c(!1),u(!0),F.success(e(`login.welcome`));let t=I.getState().user;await new Promise(e=>setTimeout(e,550)),t?.is_super_admin?h(`/dashboard/admin`):h(`/dashboard`)}else{let t=I.getState(),n=t.errorCode?e(`error.${t.errorCode}`,{seconds:t.errorData?.retry_after}):t.error||e(`error.invalid_credentials`);F.error(n),c(!1)}},className:`space-y-5`,children:[(0,P.jsx)(Sn,{label:e(`login.username`),type:`text`,value:t,onChange:e=>n(e.target.value),placeholder:e(`login.usernamePh`),className:`h-11`,autoFocus:!0,required:!0}),(0,P.jsx)(Sn,{label:e(`login.password`),type:a?`text`:`password`,value:r,onChange:e=>i(e.target.value),placeholder:e(`login.passwordPh`),className:`h-11`,required:!0,suffix:(0,P.jsx)(`button`,{type:`button`,onClick:()=>o(!a),className:`hover:text-tx2 transition-colors`,children:a?(0,P.jsx)(ye,{size:18}):(0,P.jsx)(ge,{size:18})})}),(0,P.jsx)(xn,{type:`submit`,variant:`primary`,loading:s,disabled:s||l,className:j(`w-full h-11 glow-accent transition-colors duration-300`,l&&`cursor-default`),style:l?{background:`var(--color-success)`}:void 0,children:l?(0,P.jsxs)(`span`,{className:`inline-flex items-center gap-1.5 animate-check-pop`,children:[(0,P.jsx)(_,{size:18,strokeWidth:3}),e(`login.success`)]}):e(s?`login.signingIn`:`login.signIn`)})]}),!w&&!x&&(0,P.jsx)(`div`,{className:`text-center mt-4`,children:(0,P.jsxs)(`button`,{type:`button`,onClick:()=>{S(!0)},className:`text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1.5`,children:[(0,P.jsx)(Te,{size:14}),e(`login.forgot`)]})}),(0,P.jsx)(`p`,{className:`text-center text-xs text-tx3 mt-6`,children:e(`login.secure`)})]}),x&&(0,P.jsxs)(dn,{className:`mt-4`,bodyClassName:`p-6 sm:p-8`,children:[(0,P.jsxs)(`div`,{className:`flex items-center gap-3 mb-6`,children:[(0,P.jsx)(`button`,{type:`button`,onClick:()=>{S(!1),ie(!1),ee(``)},className:`text-tx3 hover:text-tx2 transition-colors`,children:(0,P.jsx)(p,{size:20})}),(0,P.jsx)(`h2`,{className:`text-xl font-semibold font-display`,children:e(`login.resetTitle`)})]}),re?(0,P.jsxs)(`div`,{className:`text-center py-4`,children:[(0,P.jsx)(`div`,{className:`w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4`,children:(0,P.jsxs)(`svg`,{width:`28`,height:`28`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,className:`text-success`,children:[(0,P.jsx)(`path`,{d:`M22 11.08V12a10 10 0 11-5.93-9.14`}),(0,P.jsx)(`polyline`,{points:`22 4 12 14.01 9 11.01`})]})}),(0,P.jsx)(`p`,{className:`text-sm text-tx2 mb-2`,children:e(`login.resetSent`)}),(0,P.jsx)(`p`,{className:`text-xs text-tx3`,children:e(`login.resetSentHint`)}),(0,P.jsx)(xn,{type:`button`,variant:`primary`,className:`mt-6`,onClick:()=>{S(!1),ie(!1),ee(``)},children:e(`login.backToLogin`)})]}):(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(`p`,{className:`text-sm text-tx3 mb-5`,children:e(`login.resetHint`)}),(0,P.jsxs)(`form`,{onSubmit:async t=>{t.preventDefault(),ne(!0);try{let t=await(await fetch(`/api/public/forgot-password`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({identifier:C})})).json();t.success?(ie(!0),F.success(e(`login.resetRequestSent`))):F.error(t.message||e(`error.generic`))}catch{F.error(e(`login.networkError`))}ne(!1)},className:`space-y-5`,children:[(0,P.jsx)(Sn,{label:e(`login.username`),type:`text`,value:C,onChange:e=>ee(e.target.value),placeholder:e(`login.usernamePh`),className:`h-11`,autoFocus:!0,required:!0}),(0,P.jsx)(xn,{type:`submit`,variant:`primary`,loading:te,className:`w-full h-11 glow-accent`,children:e(te?`login.sending`:`login.sendReset`)})]})]})]})]})}var Nl=(0,M.lazy)(()=>D(()=>import(`./Dashboard-Dsjk0Q9D.js`).then(e=>({default:e.Dashboard})),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]))),Pl=(0,M.lazy)(()=>D(()=>import(`./AllOnus-DFKo-oAv.js`).then(e=>({default:e.AllOnus})),__vite__mapDeps([16,1,2,3,4,5,6,7,8,9,10,11,12,17,18,13]))),Fl=(0,M.lazy)(()=>D(()=>import(`./ViewOnu-CiLpR_cK.js`).then(e=>({default:e.ViewOnu})),__vite__mapDeps([19,1,2,3,4,5,6,7,10,12,18,20,21]))),Il=(0,M.lazy)(()=>D(()=>import(`./AddOnu-C73dKWfy.js`).then(e=>({default:e.AddOnu})),__vite__mapDeps([22,1,2,3,4,5,6,7,8,9,10]))),Ll=(0,M.lazy)(()=>D(()=>import(`./OltSettings-D_-ElkZi.js`).then(e=>({default:e.OltSettings})),__vite__mapDeps([23,1,2,3,4,5,6,7,8,9,10,12,14]))),Rl=(0,M.lazy)(()=>D(()=>import(`./MikrotikSettings-DZVvyY3x.js`).then(e=>({default:e.MikrotikSettings})),__vite__mapDeps([24,1,2,3,4,7,8,5,6,9,10,12,25,26,15]))),zl=(0,M.lazy)(()=>D(()=>import(`./UserManagement-BQZPcmTE.js`).then(e=>({default:e.UserManagement})),__vite__mapDeps([27,1,2,4,7,8,5,6,9,10,3,12]))),Bl=(0,M.lazy)(()=>D(()=>import(`./Customization-DuJNWfDh.js`).then(e=>({default:e.Customization})),__vite__mapDeps([28,1,2,3,4,5,6,7,8,9,10,12,14]))),Vl=(0,M.lazy)(()=>D(()=>import(`./RegisterWizard-Gs-jS_cq.js`).then(e=>({default:e.RegisterWizard})),__vite__mapDeps([29,1,2,3,4,5,6,7,17,30]))),Hl=(0,M.lazy)(()=>D(()=>import(`./ProvisionWizard-A_ED0Rv7.js`).then(e=>({default:e.ProvisionWizard})),__vite__mapDeps([31,1,2,3,4,5,6,7,8,9,10,17,30]))),Ul=(0,M.lazy)(()=>D(()=>import(`./OltConfiguration-j44_7_Y8.js`).then(e=>({default:e.OltConfiguration})),__vite__mapDeps([32,1,2,3,4,5,6,7,10,12,14,20]))),Wl=(0,M.lazy)(()=>D(()=>import(`./MyProfile-BWn7YThR.js`).then(e=>({default:e.MyProfile})),__vite__mapDeps([33,1,2,4,7,8,5,6,9,10,3,34]))),Gl=(0,M.lazy)(()=>D(()=>import(`./AlertSettings-3_MHXsZL.js`).then(e=>({default:e.AlertSettings})),__vite__mapDeps([35,1,2,4,5,6,8,9,10,3,34,7,12]))),Kl=(0,M.lazy)(()=>D(()=>import(`./FtthInfrastructure-DHkjywEu.js`).then(e=>({default:e.FtthInfrastructure})),__vite__mapDeps([36,1,2,3,4,5,6,7,8,9,10,12,18]))),ql=(0,M.lazy)(()=>D(()=>import(`./Templates-BiEINh1o.js`).then(e=>({default:e.default})),__vite__mapDeps([37,1,2,3,4,5,6,7,8,9,10]))),Jl=(0,M.lazy)(()=>D(()=>import(`./Tr069Profile-DG3Lcdsw.js`).then(e=>({default:e.default})),__vite__mapDeps([38,1,2,3,4,5,6,7,8,9,10,12]))),Yl=(0,M.lazy)(()=>D(()=>import(`./ActionLogs-S_3XVjan.js`).then(e=>({default:e.ActionLogs})),__vite__mapDeps([39,1,2,4,5,6,7,26,8,9,10,3,11]))),Xl=(0,M.lazy)(()=>D(()=>import(`./Devices-DTPHghdr.js`).then(e=>({default:e.Devices})),__vite__mapDeps([25,1,2,3,4,5,6,7,26,8,9,10,12,15]))),Zl=(0,M.lazy)(()=>D(()=>import(`./DeviceDetail-Cu5POVaR.js`).then(e=>({default:e.DeviceDetail})),__vite__mapDeps([40,1,2,3,4,5,6,7,8,9,10,12,15,25,26,20,21]))),Ql=(0,M.lazy)(()=>D(()=>import(`./Incidents-Dke0lEhN.js`).then(e=>({default:e.Incidents})),__vite__mapDeps([41,1,2,3,4,5,6,7,8,9,10]))),$l=(0,M.lazy)(()=>D(()=>import(`./IncidentDetail-CIEQlzq8.js`).then(e=>({default:e.IncidentDetail})),__vite__mapDeps([42,1,2,3,4,5,6,7,8,9,10,41]))),eu=(0,M.lazy)(()=>D(()=>import(`./AlertHistory-Cr28lPcC.js`).then(e=>({default:e.AlertHistory})),__vite__mapDeps([43,1,2,4,5,6,8,9,10,3]))),tu=(0,M.lazy)(()=>D(()=>import(`./Traffic-xmL8xPsL.js`).then(e=>({default:e.Traffic})),__vite__mapDeps([44,1,2,4,5,6,7,8,9,10,3,11,20,21]))),nu=(0,M.lazy)(()=>D(()=>import(`./AiAgentSettings-hOFbQ-MP.js`).then(e=>({default:e.AiAgentSettings})),__vite__mapDeps([45,1,2,4,7,8,5,6,9,10,3]))),ru=(0,M.lazy)(()=>D(()=>import(`./CloudflareTunnel-CyqMWF4w.js`).then(e=>({default:e.CloudflareTunnel})),__vite__mapDeps([46,1,2,4,8,5,6,9,10,3]))),iu=(0,M.lazy)(()=>D(()=>import(`./GuidePage-bRFbTAha.js`).then(e=>({default:e.GuidePage})),__vite__mapDeps([47,1,2,4,8,5,6,9,10,3,11]))),au=(0,M.lazy)(()=>D(()=>import(`./UnconfiguredOnus-k3gJ7H8Q.js`).then(e=>({default:e.UnconfiguredOnus})),__vite__mapDeps([48,1,2,3,4,5,6,7,8,9,10]))),ou=(0,M.lazy)(()=>D(()=>import(`./OnuWizard-BAaZGTGF.js`).then(e=>({default:e.OnuWizard})),__vite__mapDeps([49,1,2,3,4,5,6,7,8,9,10,30]))),su=(0,M.lazy)(()=>D(()=>import(`./SystemUpdate-Dt5m5ho6.js`).then(e=>({default:e.SystemUpdate})),__vite__mapDeps([50,1,2,4,7,8,5,6,9,10,3]))),cu=(0,M.lazy)(()=>D(()=>import(`./OltLogs-B9PBcnjb.js`).then(e=>({default:e.OltLogs})),__vite__mapDeps([51,1,2,4,5,6,7,8,9,10,3]))),lu=(0,M.lazy)(()=>D(()=>import(`./AutoProvision-Bpti0akj.js`).then(e=>({default:e.AutoProvision})),__vite__mapDeps([52,1,2,4,8,5,6,9,10,3]))),uu=(0,M.lazy)(()=>D(()=>import(`./Reports-BC5iaI1j.js`).then(e=>({default:e.Reports})),__vite__mapDeps([53,1,2,4,8,5,6,12]))),du=(0,M.lazy)(()=>D(()=>import(`./Terminal-uYraaCKe.js`).then(e=>({default:e.Terminal})),__vite__mapDeps([54,1,2,3,4,7,8,5,6,12,55]))),fu={"/dashboard/onus/add":`add_onu`,"/dashboard/onus/register":`add_onu`,"/dashboard/onus/provision":`add_onu`,"/dashboard/onus/pre-config":`add_onu`,"/dashboard/onus/unconfigured":`add_onu`,"/dashboard/onus/wizard/register":`add_onu`,"/dashboard/onus/wizard/provision":`add_onu`,"/dashboard/onus/wizard/preconfig":`add_onu`,"/dashboard/settings/olts":`settings_ip_olts`,"/dashboard/settings/mikrotik":`settings_ip_olts`,"/dashboard/customization":`customization`,"/dashboard/users":`manage_users`,"/dashboard/templates":`manage_templates`,"/dashboard/templates/tr069-profile":`manage_tr069`,"/dashboard/logs":`manage_users`,"/dashboard/settings/alerts":`customization`,"/dashboard/settings/cloudflare":`super_admin`,"/dashboard/settings/update":`super_admin`,"/dashboard/settings/auto-provision":`settings_ip_olts`},pu=[{pattern:/^\/dashboard\/settings\/olts\/\d+\/config$/,perm:`settings_ip_olts`}];function mu({children:e}){let{user:t,loading:n}=I(),{pathname:r}=De();if(n&&!t)return(0,P.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,P.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,P.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,P.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,P.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,P.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})});if(!t)return(0,P.jsx)(Oe,{to:`/`,replace:!0});if(t.must_change_password&&r!==`/dashboard/profile`)return(0,P.jsx)(Oe,{to:`/dashboard/profile`,replace:!0});let i=fu[r];if(!i){for(let e of pu)if(e.pattern.test(r)){i=e.perm;break}}if(i){if(i===`super_admin`){if(!t.is_super_admin&&!new Set(t.permissions||[]).has(`all_olt`))return(0,P.jsx)(Oe,{to:`/dashboard`,replace:!0})}else{let e=new Set(t.permissions||[]);if(!t.is_super_admin&&!e.has(`all_olt`)&&!e.has(i))return(0,P.jsx)(Oe,{to:`/dashboard`,replace:!0})}}return(0,P.jsx)(P.Fragment,{children:e})}function hu(){let{fetchUser:e,user:t}=I();return(0,M.useEffect)(()=>{t&&(t.theme&&Wt.getState().set(t.theme,{persist:!1}),t.language&&nt.changeLanguage(t.language))},[t]),(0,M.useEffect)(()=>{let t=window.location.pathname||`/`;t!==`/`&&t!==`/login`?e():I.setState({loading:!1}),fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{e.timezone&&tt(e.timezone)}).catch(()=>{})},[e]),(0,P.jsx)(Rr,{children:(0,P.jsx)(M.Suspense,{fallback:(0,P.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,P.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,P.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,P.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,P.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,P.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})}),children:(0,P.jsxs)(Pe,{children:[(0,P.jsx)(O,{path:`/`,element:(0,P.jsx)(Oe,{to:`/login`,replace:!0})}),(0,P.jsx)(O,{path:`/login`,element:(0,P.jsx)(Ml,{})}),(0,P.jsxs)(O,{path:`/dashboard`,element:(0,P.jsxs)(mu,{children:[(0,P.jsx)(Nr,{}),(0,P.jsx)(Lr,{})]}),children:[(0,P.jsx)(O,{index:!0,element:(0,P.jsx)(Nl,{})}),(0,P.jsx)(O,{path:`onus`,element:(0,P.jsx)(Pl,{})}),(0,P.jsx)(O,{path:`onus/add`,element:(0,P.jsx)(Il,{})}),(0,P.jsx)(O,{path:`onus/register`,element:(0,P.jsx)(Vl,{})}),(0,P.jsx)(O,{path:`onus/provision`,element:(0,P.jsx)(Hl,{})}),(0,P.jsx)(O,{path:`onus/pre-config`,element:(0,P.jsx)(Hl,{manualMode:!0})}),(0,P.jsx)(O,{path:`onus/unconfigured`,element:(0,P.jsx)(au,{})}),(0,P.jsx)(O,{path:`onus/wizard/register`,element:(0,P.jsx)(ou,{mode:`register`})}),(0,P.jsx)(O,{path:`onus/wizard/provision`,element:(0,P.jsx)(ou,{mode:`provision`})}),(0,P.jsx)(O,{path:`onus/wizard/preconfig`,element:(0,P.jsx)(ou,{mode:`preconfig`})}),(0,P.jsx)(O,{path:`onus/:id`,element:(0,P.jsx)(Fl,{})}),(0,P.jsx)(O,{path:`all-onus/view-c3-r/gpon/:oltId/:frame/:slot/:onuNum`,element:(0,P.jsx)(Fl,{})}),(0,P.jsx)(O,{path:`settings/olts`,element:(0,P.jsx)(Ll,{})}),(0,P.jsx)(O,{path:`settings/mikrotik`,element:(0,P.jsx)(Rl,{})}),(0,P.jsx)(O,{path:`settings/olts/:oltId/config`,element:(0,P.jsx)(Ul,{})}),(0,P.jsx)(O,{path:`customization`,element:(0,P.jsx)(Bl,{})}),(0,P.jsx)(O,{path:`users`,element:(0,P.jsx)(zl,{})}),(0,P.jsx)(O,{path:`profile`,element:(0,P.jsx)(Wl,{})}),(0,P.jsx)(O,{path:`settings/alerts`,element:(0,P.jsx)(Gl,{})}),(0,P.jsx)(O,{path:`settings/cloudflare`,element:(0,P.jsx)(ru,{})}),(0,P.jsx)(O,{path:`settings/ai`,element:(0,P.jsx)(nu,{})}),(0,P.jsx)(O,{path:`settings/auto-provision`,element:(0,P.jsx)(lu,{})}),(0,P.jsx)(O,{path:`alerts/history`,element:(0,P.jsx)(eu,{})}),(0,P.jsx)(O,{path:`devices`,element:(0,P.jsx)(Xl,{})}),(0,P.jsx)(O,{path:`devices/:id`,element:(0,P.jsx)(Zl,{})}),(0,P.jsx)(O,{path:`incidents`,element:(0,P.jsx)(Ql,{})}),(0,P.jsx)(O,{path:`incidents/:id`,element:(0,P.jsx)($l,{})}),(0,P.jsx)(O,{path:`ftth`,element:(0,P.jsx)(Kl,{})}),(0,P.jsx)(O,{path:`templates`,element:(0,P.jsx)(ql,{})}),(0,P.jsx)(O,{path:`templates/tr069-profile`,element:(0,P.jsx)(Jl,{})}),(0,P.jsx)(O,{path:`traffic`,element:(0,P.jsx)(tu,{})}),(0,P.jsx)(O,{path:`logs`,element:(0,P.jsx)(Yl,{})}),(0,P.jsx)(O,{path:`reports`,element:(0,P.jsx)(uu,{})}),(0,P.jsx)(O,{path:`terminal`,element:(0,P.jsx)(du,{})}),(0,P.jsx)(O,{path:`guide`,element:(0,P.jsx)(iu,{})}),(0,P.jsx)(O,{path:`settings/update`,element:(0,P.jsx)(su,{})}),(0,P.jsx)(O,{path:`olt-logs`,element:(0,P.jsx)(cu,{})})]}),(0,P.jsx)(O,{path:`*`,element:(0,P.jsx)(Oe,{to:`/`,replace:!0})})]})})})}or(),window.addEventListener(`vite:preloadError`,e=>{let t=`nms-chunk-reload-at`,n=Number(sessionStorage.getItem(t)||0);Date.now()-n>3e4&&(e.preventDefault(),sessionStorage.setItem(t,String(Date.now())),window.location.reload())}),Gt();var gu=new dt({defaultOptions:{queries:{retry:1,staleTime:1e4,refetchOnWindowFocus:!1}}});(0,Ot.createRoot)(document.getElementById(`root`)).render((0,P.jsx)(M.StrictMode,{children:(0,P.jsx)(Fe,{children:(0,P.jsxs)(ze,{client:gu,children:[(0,P.jsx)(hu,{}),(0,P.jsx)(Pt,{}),(0,P.jsx)(Lt,{})]})})}));export{It as A,mn as C,nn as D,un as E,N as M,wt as N,Wt as O,hn as S,dn as T,Sn as _,Un as a,vn as b,Ln as c,jn as d,An as f,Cn as g,wn as h,Wn as i,F as j,I as k,In as l,En as m,ur as n,zn as o,Dn as p,Gn as r,Rn as s,br as t,Fn as u,xn as v,fn as w,gn as x,yn as y};