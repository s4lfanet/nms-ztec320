const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Dashboard-YPn4fsC1.js","assets/rolldown-runtime-hePW80VL.js","assets/vendor-icons-CFgAJCYu.js","assets/vendor-react-Ba_ahfGP.js","assets/vendor-query-C6UWI0s8.js","assets/utils-DI4U3qni.js","assets/PageContainer-s8iG3NRI.js","assets/PageHeader-D01AsMXH.js","assets/Breadcrumb-DNhfsPJQ.js","assets/shared-DOtYoVZF.js","assets/useHasPerm-BrmBaJtw.js","assets/AllOnus-DeIm32FN.js","assets/ftthTree-wH5JBsVx.js","assets/LocationPicker-D-35UulB.js","assets/ViewOnu-TlCw7mP1.js","assets/AreaChart-Dh1oc8ua.js","assets/YAxis-BnxnSwaC.js","assets/AddOnu-B-Hf2Eea.js","assets/OltSettings-CzPMsecM.js","assets/UserManagement-BeNATzK5.js","assets/Customization-BSu17ayo.js","assets/RegisterWizard-B1-OEsKc.js","assets/ProvisionWizard-CgVDkpyh.js","assets/OltConfiguration-CQoOUqou.js","assets/MyProfile-DHcEFzmL.js","assets/AlertSettings-cumBXBgP.js","assets/FtthInfrastructure-DZE91Nyt.js","assets/Templates-D1BYbQhq.js","assets/Tr069Profile-DnTR3THI.js","assets/ActionLogs-Bfia17Pm.js","assets/AlertHistory-CK5l9n09.js","assets/Traffic-D_rmhVx7.js","assets/CloudflareTunnel-NkLQYoDJ.js","assets/GuidePage-D56LQgP9.js","assets/UnconfiguredOnus-W1q6wrc4.js","assets/OnuWizard-CsAp6jRq.js","assets/SystemUpdate-ByOZksKA.js","assets/OltLogs-C6FmNHvJ.js","assets/AutoProvision-FBHT0yYh.js"])))=>i.map(i=>d[i]);
import{r as e}from"./rolldown-runtime-hePW80VL.js";import{$t as t,At as n,B as r,C as i,E as a,Kt as o,Mt as s,Nt as c,O as l,Ut as u,W as d,Zt as f,a as p,an as m,bt as h,d as g,dt as _,fn as v,gn as y,gt as b,hn as ee,i as x,it as te,j as S,m as ne,n as C,nn as re,qt as ie,s as ae,sn as oe,st as se,t as w,tn as ce,tt as le,un as ue,yt as de}from"./vendor-icons-CFgAJCYu.js";import{a as fe,c as pe,f as T,i as me,l as he,m as ge,o as E,p as _e,r as ve,s as ye,t as be}from"./vendor-react-Ba_ahfGP.js";import{_ as xe,a as Se,b as Ce,c as we,d as Te,f as Ee,g as D,h as De,i as Oe,l as O,m as ke,n as Ae,o as je,r as Me,s as Ne,t as Pe,u as Fe,v as Ie,x as Le,y as Re}from"./vendor-query-C6UWI0s8.js";import{i as ze,t as k}from"./utils-DI4U3qni.js";import{t as Be}from"./vendor-state-Dd_bP5pH.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var Ve=class extends Le{constructor(e={}){super(),this.config=e,this.#e=new Set,this.#t=new Map,this.#n=0}#e;#t;#n;build(e,t,n){let r=new je({client:e,mutationCache:this,mutationId:++this.#n,options:e.defaultMutationOptions(t),state:n});return this.add(r),r}add(e){this.#e.add(e);let t=He(e);if(typeof t==`string`){let n=this.#t.get(t);n?n.push(e):this.#t.set(t,[e])}this.notify({type:`added`,mutation:e})}remove(e){if(this.#e.delete(e)){let t=He(e);if(typeof t==`string`){let n=this.#t.get(t);if(n){if(n.length>1){let t=n.indexOf(e);t!==-1&&n.splice(t,1)}else n[0]===e&&this.#t.delete(t)}}}this.notify({type:`removed`,mutation:e})}canRun(e){let t=He(e);if(typeof t==`string`){let n=this.#t.get(t)?.find(e=>e.state.status===`pending`);return!n||n===e}return!0}runNext(e){let t=He(e);return typeof t==`string`?(this.#t.get(t)?.find(t=>t!==e&&t.state.isPaused))?.continue()??Promise.resolve():Promise.resolve()}clear(){O.batch(()=>{this.#e.forEach(e=>{this.notify({type:`removed`,mutation:e})}),this.#e.clear(),this.#t.clear()})}getAll(){return Array.from(this.#e)}find(e){let t={exact:!0,...e};return this.getAll().find(e=>ke(t,e))}findAll(e={}){return this.getAll().filter(t=>ke(e,t))}notify(e){O.batch(()=>{this.listeners.forEach(t=>{t(e)})})}resumePausedMutations(){let e=this.getAll().filter(e=>e.state.isPaused);return O.batch(()=>Promise.all(e.map(e=>e.continue().catch(D))))}};function He(e){return e.options.scope?.id}var Ue=class extends Le{constructor(e={}){super(),this.config=e,this.#e=new Map}#e;build(e,t,n){let r=t.queryKey,i=t.queryHash??Ee(r,t),a=this.get(i);return a||(a=new Ne({client:e,queryKey:r,queryHash:i,options:e.defaultQueryOptions(t),state:n,defaultOptions:e.getQueryDefaults(r)}),this.add(a)),a}add(e){this.#e.has(e.queryHash)||(this.#e.set(e.queryHash,e),this.notify({type:`added`,query:e}))}remove(e){let t=this.#e.get(e.queryHash);t&&(e.destroy(),t===e&&this.#e.delete(e.queryHash),this.notify({type:`removed`,query:e}))}clear(){O.batch(()=>{this.getAll().forEach(e=>{this.remove(e)})})}get(e){return this.#e.get(e)}getAll(){return[...this.#e.values()]}find(e){let t={exact:!0,...e};return this.getAll().find(e=>De(t,e))}findAll(e={}){let t=this.getAll();return Object.keys(e).length>0?t.filter(t=>De(e,t)):t}notify(e){O.batch(()=>{this.listeners.forEach(t=>{t(e)})})}onFocus(){O.batch(()=>{this.getAll().forEach(e=>{e.onFocus()})})}onOnline(){O.batch(()=>{this.getAll().forEach(e=>{e.onOnline()})})}},We=class{#e;#t;#n;#r;#i;#a;#o;#s;constructor(e={}){this.#e=e.queryCache||new Ue,this.#t=e.mutationCache||new Ve,this.#n=e.defaultOptions||{},this.#r=new Map,this.#i=new Map,this.#a=0}mount(){this.#a++,this.#a===1&&(this.#o=Ce.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onFocus())}),this.#s=we.subscribe(async e=>{e&&(await this.resumePausedMutations(),this.#e.onOnline())}))}unmount(){this.#a--,this.#a===0&&(this.#o?.(),this.#o=void 0,this.#s?.(),this.#s=void 0)}isFetching(e){return this.#e.findAll({...e,fetchStatus:`fetching`}).length}isMutating(e){return this.#t.findAll({...e,status:`pending`}).length}getQueryData(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state.data}ensureQueryData(e){let t=this.defaultQueryOptions(e),n=this.#e.build(this,t),r=n.state.data;return r===void 0?this.fetchQuery(e):(e.revalidateIfStale&&n.isStaleByTime(Ie(t.staleTime,n))&&this.prefetchQuery(t),Promise.resolve(r))}getQueriesData(e){return this.#e.findAll(e).map(({queryKey:e,state:t})=>[e,t.data])}setQueryData(e,t,n){let r=this.defaultQueryOptions({queryKey:e}),i=this.#e.get(r.queryHash)?.state.data,a=Fe(t,i);if(a!==void 0)return this.#e.build(this,r).setData(a,{...n,manual:!0})}setQueriesData(e,t,n){return O.batch(()=>this.#e.findAll(e).map(({queryKey:e})=>[e,this.setQueryData(e,t,n)]))}getQueryState(e){let t=this.defaultQueryOptions({queryKey:e});return this.#e.get(t.queryHash)?.state}removeQueries(e){let t=this.#e;O.batch(()=>{t.findAll(e).forEach(e=>{t.remove(e)})})}resetQueries(e,t){let n=this.#e;return O.batch(()=>(n.findAll(e).forEach(e=>{e.reset()}),this.refetchQueries({type:`active`,...e},t)))}cancelQueries(e,t={}){let n={revert:!0,...t},r=O.batch(()=>this.#e.findAll(e).map(e=>e.cancel(n)));return Promise.all(r).then(D).catch(D)}invalidateQueries(e,t={}){return O.batch(()=>(this.#e.findAll(e).forEach(e=>{e.invalidate()}),e?.refetchType===`none`?Promise.resolve():this.refetchQueries({...e,type:e?.refetchType??e?.type??`active`},t)))}refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=O.batch(()=>this.#e.findAll(e).filter(e=>!e.isDisabled()&&!e.isStatic()).map(e=>{let t=e.fetch(void 0,n);return n.throwOnError||(t=t.catch(D)),e.state.fetchStatus===`paused`?Promise.resolve():t}));return Promise.all(r).then(D)}fetchQuery(e){let t=this.defaultQueryOptions(e);t.retry===void 0&&(t.retry=!1);let n=this.#e.build(this,t);return n.isStaleByTime(Ie(t.staleTime,n))?n.fetch(t):Promise.resolve(n.state.data)}prefetchQuery(e){return this.fetchQuery(e).then(D).catch(D)}fetchInfiniteQuery(e){return e._type=`infinite`,this.fetchQuery(e)}prefetchInfiniteQuery(e){return this.fetchInfiniteQuery(e).then(D).catch(D)}ensureInfiniteQueryData(e){return e._type=`infinite`,this.ensureQueryData(e)}resumePausedMutations(){return we.isOnline()?this.#t.resumePausedMutations():Promise.resolve()}getQueryCache(){return this.#e}getMutationCache(){return this.#t}getDefaultOptions(){return this.#n}setDefaultOptions(e){this.#n=e}setQueryDefaults(e,t){this.#r.set(Te(e),{queryKey:e,defaultOptions:t})}getQueryDefaults(e){let t=[...this.#r.values()],n={};return t.forEach(t=>{xe(e,t.queryKey)&&Object.assign(n,t.defaultOptions)}),n}setMutationDefaults(e,t){this.#i.set(Te(e),{mutationKey:e,defaultOptions:t})}getMutationDefaults(e){let t=[...this.#i.values()],n={};return t.forEach(t=>{xe(e,t.mutationKey)&&Object.assign(n,t.defaultOptions)}),n}defaultQueryOptions(e){if(e._defaulted)return e;let t={...this.#n.queries,...this.getQueryDefaults(e.queryKey),...e,_defaulted:!0};return t.queryHash||=Ee(t.queryKey,t),t.refetchOnReconnect===void 0&&(t.refetchOnReconnect=t.networkMode!==`always`),t.throwOnError===void 0&&(t.throwOnError=!!t.suspense),!t.networkMode&&t.persister&&(t.networkMode=`offlineFirst`),t.queryFn===Re&&(t.enabled=!1),t}defaultMutationOptions(e){return e?._defaulted?e:{...this.#n.mutations,...e?.mutationKey&&this.getMutationDefaults(e.mutationKey),...e,_defaulted:!0}}clear(){this.#e.clear(),this.#t.clear()}},Ge=_e(),A=e(y(),1),j=Se(),Ke=4e3,qe=4,Je=null;function M(e,t=`info`,n=Ke){Je?.({type:t,message:e,duration:n})}M.success=e=>M(e,`success`),M.error=e=>M(e,`error`,5e3),M.warning=e=>M(e,`warning`),M.info=e=>M(e,`info`);var Ye={success:(0,j.jsx)(ie,{size:18,className:`text-success`}),error:(0,j.jsx)(u,{size:18,className:`text-danger`}),warning:(0,j.jsx)(g,{size:18,className:`text-warning`}),info:(0,j.jsx)(h,{size:18,className:`text-accent`})},Xe={success:`border-success/30 bg-success/10`,error:`border-danger/30 bg-danger/10`,warning:`border-warning/30 bg-warning/10`,info:`border-accent/30 bg-accent/10`};function Ze(){let[e,t]=(0,A.useState)([]),n=(0,A.useRef)({}),r=(0,A.useCallback)(e=>{t(t=>t.map(t=>t.id===e?{...t,exiting:!0}:t)),setTimeout(()=>{t(t=>t.filter(t=>t.id!==e)),delete n.current[e]},250)},[]),i=(0,A.useCallback)(e=>{t(t=>{if(t.find(t=>t.type===e.type&&t.message===e.message&&!t.exiting))return t;let i=`${e.type}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,a=e.duration||Ke;n.current[i]=setTimeout(()=>r(i),a);let o=[...t,{...e,id:i}];return o.length<=qe?o:(o.slice(0,o.length-qe).forEach(e=>{clearTimeout(n.current[e.id]),delete n.current[e.id]}),o.slice(o.length-qe))})},[r]);return(0,A.useEffect)(()=>(Je=i,()=>{Je=null}),[i]),(0,A.useEffect)(()=>()=>{Object.values(n.current).forEach(clearTimeout)},[]),(0,j.jsx)(`div`,{className:`fixed top-20 left-4 right-4 sm:left-auto sm:w-full max-w-sm z-[9999] flex flex-col gap-2 pointer-events-none`,children:e.map(e=>(0,j.jsxs)(`div`,{className:k(`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl`,`shadow-lg transition-all duration-250`,Xe[e.type],e.exiting?`opacity-0 translate-x-4`:`animate-slide-in opacity-100`),children:[(0,j.jsx)(`span`,{className:`flex-shrink-0`,children:Ye[e.type]}),(0,j.jsx)(`span`,{className:`text-sm font-medium flex-1 text-tx1`,children:e.message}),(0,j.jsx)(`button`,{onClick:()=>r(e.id),className:`flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`,children:(0,j.jsx)(C,{size:14})})]},e.id))})}var Qe=null;function $e(e){return Qe?Qe(e):Promise.resolve(window.confirm(e.message))}function et(){let[e,t]=(0,A.useState)(!1),[n,r]=(0,A.useState)({title:``,message:``}),[i,a]=(0,A.useState)(null);(0,A.useEffect)(()=>(Qe=e=>(r(e),t(!0),new Promise(e=>a(()=>e))),()=>{Qe=null}),[]);let o=e=>{t(!1),i?.(e)};if(!e)return null;let s=n.variant===`danger`?`bg-danger hover:bg-danger/80 text-white`:n.variant===`warning`?`bg-warning hover:bg-warning/80 text-black`:`bg-accent hover:bg-accent-hover text-white`;return(0,j.jsxs)(`div`,{className:`fixed inset-0 z-[9998] flex items-center justify-center p-4`,children:[(0,j.jsx)(`div`,{className:`modal-overlay`,onClick:()=>o(!1)}),(0,j.jsxs)(`div`,{className:`relative glass-card p-6 w-full max-w-md animate-fade-in`,children:[(0,j.jsx)(`button`,{onClick:()=>o(!1),className:`absolute top-4 right-4 text-tx3 hover:text-tx1`,children:(0,j.jsx)(C,{size:18})}),(0,j.jsxs)(`div`,{className:`flex items-center gap-3 mb-4`,children:[(0,j.jsx)(`div`,{className:k(`w-10 h-10 rounded-xl flex items-center justify-center`,n.variant===`danger`?`bg-danger/15 text-danger`:`bg-warning/15 text-warning`),children:(0,j.jsx)(g,{size:20})}),(0,j.jsx)(`h3`,{className:`text-lg font-semibold`,children:n.title})]}),(0,j.jsx)(`p`,{className:`text-tx2 text-sm mb-6`,children:n.message}),(0,j.jsxs)(`div`,{className:`flex justify-end gap-3`,children:[(0,j.jsx)(`button`,{onClick:()=>o(!1),className:`px-4 py-2 rounded-xl text-sm hover:bg-glass transition-colors`,children:n.cancelLabel||`Cancel`}),(0,j.jsx)(`button`,{onClick:()=>o(!0),className:k(`px-4 py-2 rounded-xl text-sm font-medium transition-all`,s),children:n.confirmLabel||`Confirm`})]})]})]})}var tt=``,nt=window.fetch.bind(window);window.fetch=(e,t)=>{let n=(t?.method||`GET`).toUpperCase();if(n!==`GET`&&n!==`HEAD`){let e=new Headers(t?.headers);e.has(`X-Requested-With`)||e.set(`X-Requested-With`,`XMLHttpRequest`),t={...t,headers:e}}return nt(e,t)};async function N(e,t={}){let n=await fetch(`${tt}${e}`,{credentials:`include`,headers:{"Content-Type":`application/json`,"X-Requested-With":`XMLHttpRequest`,...t.headers},...t}),r=await n.json().catch(()=>({}));if(!n.ok)throw Error(r.message||`HTTP ${n.status}`);return r}var rt={login:(e,t)=>N(`/api/auth/login`,{method:`POST`,body:JSON.stringify({username:e,password:t})}),logout:()=>N(`/api/auth/logout`,{method:`POST`}),me:()=>N(`/api/auth/me`),publicPackages:()=>N(`/api/public/packages`),publicRegister:e=>N(`/api/public/register`,{method:`POST`,body:JSON.stringify(e)}),publicRegisterPay:e=>N(`/api/public/register/pay`,{method:`POST`,body:JSON.stringify(e)}),publicRegistrationStatus:e=>N(`/api/public/registration-status/${e}`),dashboard:e=>N(`/api/dashboard${e&&typeof e==`object`&&`nocache`in e&&e.nocache?`?nocache=1`:``}`),allOnus:e=>{let t=new URLSearchParams;e?.olt&&e.olt!==`all`&&t.set(`olt`,e.olt),e?.status&&e.status!==`all`&&t.set(`status`,e.status),e?.pon&&e.pon!==`all`&&t.set(`pon`,e.pon),e?.search&&t.set(`search`,e.search),e?.page&&t.set(`page`,String(e.page)),e?.page_size&&t.set(`page_size`,String(e.page_size)),e?.sort_by&&t.set(`sort_by`,e.sort_by),e?.sort_dir&&t.set(`sort_dir`,e.sort_dir);let n=t.toString();return N(`/api/all-onus${n?`?`+n:``}`)},updateOnu:(e,t)=>N(`/api/onu/${e}/update`,{method:`POST`,body:JSON.stringify(t)}),deleteOnu:e=>N(`/api/onu/${e}/delete`,{method:`POST`}),onuAction:(e,t)=>N(`/api/onu/${e}/action`,{method:`POST`,body:JSON.stringify({action:t})}),onuReplace:(e,t)=>N(`/api/onu/${e}/replace`,{method:`POST`,body:JSON.stringify({new_serial:t})}),onuDetail:e=>N(`/api/onu/${e}/detail`),onuLiveDetail:e=>N(`/api/onu/${e}/live-detail`),onuTraffic:e=>N(`/api/onu/${e}/traffic`),onuGetStatus:e=>N(`/api/onu/${e}/get-status`,{method:`POST`}),onuLiveInfo:e=>N(`/api/onu/${e}/live-info`),refreshSignal:e=>N(`/api/olt/${e}/refresh-signal`,{method:`POST`}),getRxColors:()=>N(`/api/customization/rx-colors`),saveRxColors:e=>N(`/api/customization/rx-colors`,{method:`POST`,body:JSON.stringify({ranges:e})}),syncOlt:e=>N(`/api/olt/${e}/sync`,{method:`POST`}),syncAllOlts:()=>N(`/api/olt/sync-all`,{method:`POST`}),syncStatus:e=>N(`/api/olt/${e}/sync-status`),getOlt:e=>N(`/api/olt/${e}`),oltLogs:(e,t,n)=>{let r=new URLSearchParams({type:t});return n&&r.set(`lines`,String(n)),N(`/api/olt/${e}/olt-logs?${r}`)},syncLogs:(e,t)=>{let n=new URLSearchParams;return t&&n.set(`lines`,String(t)),N(`/api/olt/${e}/sync-logs?${n}`)},onuStatusHistory:(e,t,n)=>{let r=new URLSearchParams;return t&&r.set(`limit`,String(t)),n&&n!==`all`&&r.set(`status`,n),N(`/api/olt/${e}/onu-status-history?${r}`)},discoverSlots:e=>N(`/api/olt/${e}/discover-slots`,{method:`POST`}),testConnection:(e,t)=>N(e?`/api/olt/${e}/test-connection`:`/api/olt/test-connection`,{method:`POST`,body:JSON.stringify(t)}),ftthStats:()=>N(`/api/ftth/stats`),ftthTree:()=>N(`/api/ftth/tree`),ftthMap:()=>N(`/api/ftth/map`),ftthOtbList:()=>N(`/api/ftth/otb`),ftthOtbCreate:e=>N(`/api/ftth/otb`,{method:`POST`,body:JSON.stringify(e)}),ftthOtbUpdate:(e,t)=>N(`/api/ftth/otb/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthOtbDelete:e=>N(`/api/ftth/otb/${e}`,{method:`DELETE`}),ftthOtbPorts:e=>N(`/api/ftth/otb/${e}/ports`),ftthOtbPortUpdate:(e,t)=>N(`/api/ftth/otb-port/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthOdcList:e=>N(`/api/ftth/odc${e?`?otb_id=`+e:``}`),ftthOdcCreate:e=>N(`/api/ftth/odc`,{method:`POST`,body:JSON.stringify(e)}),ftthOdcUpdate:(e,t)=>N(`/api/ftth/odc/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthOdcDelete:e=>N(`/api/ftth/odc/${e}`,{method:`DELETE`}),ftthOdpList:e=>N(`/api/ftth/odp${e?`?odc_id=`+e:``}`),ftthOdpCreate:e=>N(`/api/ftth/odp`,{method:`POST`,body:JSON.stringify(e)}),ftthOdpUpdate:(e,t)=>N(`/api/ftth/odp/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthOdpDelete:e=>N(`/api/ftth/odp/${e}`,{method:`DELETE`}),ftthOdpPorts:e=>N(`/api/ftth/odp/${e}/ports`),ftthOdpPortUpdate:(e,t)=>N(`/api/ftth/odp-port/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthOdpPortDelete:e=>N(`/api/ftth/odp-port/${e}`,{method:`DELETE`}),ftthJcList:()=>N(`/api/ftth/jc`),ftthJcCreate:e=>N(`/api/ftth/jc`,{method:`POST`,body:JSON.stringify(e)}),ftthJcUpdate:(e,t)=>N(`/api/ftth/jc/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthJcDelete:e=>N(`/api/ftth/jc/${e}`,{method:`DELETE`}),ftthJcSpliceCreate:(e,t)=>N(`/api/ftth/jc/${e}/splice`,{method:`POST`,body:JSON.stringify(t)}),ftthJcSpliceUpdate:(e,t,n)=>N(`/api/ftth/jc/${e}/splice/${t}`,{method:`PUT`,body:JSON.stringify(n)}),ftthJcSpliceDelete:(e,t)=>N(`/api/ftth/jc/${e}/splice/${t}`,{method:`DELETE`}),ftthAvailableOnus:e=>N(`/api/ftth/available-onus${e?`?olt_id=`+e:``}`),ftthCores:(e,t)=>N(`/api/ftth/cores/${e}/${t}`),ftthCoreHistory:e=>N(`/api/ftth/cores/${e}/history`),ftthTraceOnu:e=>N(`/api/ftth/trace/onu/${e}`),ftthImpact:(e,t)=>N(`/api/ftth/impact/${e}/${t}`),ftthPonList:()=>N(`/api/ftth/pon`),ftthPonRealPorts:e=>N(`/api/ftth/pon/real/${e}`),ftthPonCreate:e=>N(`/api/ftth/pon`,{method:`POST`,body:JSON.stringify(e)}),ftthPonUpdate:(e,t)=>N(`/api/ftth/pon/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthPonDelete:e=>N(`/api/ftth/pon/${e}`,{method:`DELETE`}),ftthExport:()=>`/api/ftth/export`,ftthPathsList:()=>N(`/api/ftth/paths`),ftthPathCreate:e=>N(`/api/ftth/paths`,{method:`POST`,body:JSON.stringify(e)}),ftthPathUpdate:(e,t)=>N(`/api/ftth/paths/${e}`,{method:`PUT`,body:JSON.stringify(t)}),ftthPathDelete:e=>N(`/api/ftth/paths/${e}`,{method:`DELETE`}),ftthAutoRoute:e=>N(`/api/ftth/auto-route`,{method:`POST`,body:JSON.stringify(e)}),ftthImport:e=>{let t=new FormData;return t.append(`file`,e),N(`/api/ftth/import`,{method:`POST`,body:t})},allOnusExport:()=>`/api/all-onus/export`,metricsHistory:e=>{let t=new URLSearchParams({type:e.type});return e.olt_id&&t.set(`olt_id`,String(e.olt_id)),e.onu_id&&t.set(`onu_id`,String(e.onu_id)),e.hours&&t.set(`hours`,String(e.hours)),N(`/api/metrics/history?${t}`)},trafficMeta:()=>N(`/api/traffic/meta`),trafficGrid:e=>{let t=new URLSearchParams({olt_id:String(e.olt_id),port_type:e.port_type,period:e.period});return e.search&&t.set(`search`,e.search),N(`/api/traffic/grid?${t}`)},trafficHistory:e=>N(`/api/traffic/history?${new URLSearchParams({olt_id:String(e.olt_id),port_type:e.port_type,port_name:e.port_name,period:e.period})}`),trafficLive:e=>N(`/api/traffic/live?${new URLSearchParams({olt_id:String(e.olt_id),port_type:e.port_type,port_name:e.port_name})}`),users:()=>N(`/api/users`),technicians:()=>N(`/api/technicians`),permissions:()=>N(`/api/permissions`),createUser:e=>N(`/api/user`,{method:`POST`,body:JSON.stringify(e)}),getUser:e=>N(`/api/user/${e}`),updateUser:(e,t)=>N(`/api/user/${e}`,{method:`PUT`,body:JSON.stringify(t)}),deleteUser:e=>N(`/api/user/${e}`,{method:`DELETE`}),createRole:e=>N(`/api/role`,{method:`POST`,body:JSON.stringify(e)}),updateRole:(e,t)=>N(`/api/role/${e}`,{method:`PUT`,body:JSON.stringify(t)}),deleteRole:e=>N(`/api/role/${e}`,{method:`DELETE`}),actionLogs:e=>{let t=new URLSearchParams;return e.page&&t.set(`page`,String(e.page)),e.per_page&&t.set(`per_page`,String(e.per_page)),e.category&&t.set(`category`,e.category),e.search&&t.set(`search`,e.search),e.username&&t.set(`username`,e.username),N(`/api/action-logs?${t}`)},notifications:e=>{let t=new URLSearchParams;return e?.limit&&t.set(`limit`,String(e.limit)),e?.type&&t.set(`type`,e.type),N(`/api/notifications?${t}`)},subscriptionStatus:()=>N(`/api/subscription/status`),adminDashboard:()=>N(`/api/admin/dashboard`),adminPackages:()=>N(`/api/admin/packages`),adminCreatePackage:e=>N(`/api/admin/package`,{method:`POST`,body:JSON.stringify(e)}),adminUpdatePackage:(e,t)=>N(`/api/admin/package/${e}`,{method:`PUT`,body:JSON.stringify(t)}),adminDeletePackage:e=>N(`/api/admin/package/${e}`,{method:`DELETE`}),adminTenants:()=>N(`/api/admin/tenants`),adminCreateTenant:e=>N(`/api/admin/tenant`,{method:`POST`,body:JSON.stringify(e)}),adminUpdateTenant:(e,t)=>N(`/api/admin/tenant/${e}`,{method:`PUT`,body:JSON.stringify(t)}),adminDeleteTenant:e=>N(`/api/admin/tenant/${e}`,{method:`DELETE`}),adminSubscriptions:()=>N(`/api/admin/subscriptions`),adminCreateSubscription:e=>N(`/api/admin/subscription`,{method:`POST`,body:JSON.stringify(e)}),adminUpdateSubscription:(e,t)=>N(`/api/admin/subscription/${e}`,{method:`PUT`,body:JSON.stringify(t)}),adminDeleteSubscription:e=>N(`/api/admin/subscription/${e}`,{method:`DELETE`}),adminExtendSubscription:(e,t)=>N(`/api/admin/subscription/${e}/extend`,{method:`POST`,body:JSON.stringify({days:t})}),adminTransactions:()=>N(`/api/admin/transactions`),adminInvoices:()=>N(`/api/admin/invoices`),getSystemConfig:()=>N(`/api/system-config`),updateSystemConfig:e=>N(`/api/system-config`,{method:`PUT`,body:JSON.stringify(e)}),getRenewalInfo:e=>N(`/api/renewal/${e}`),getPaymentMethods:e=>N(`/api/payment/methods?amount=${e}`),createRenewalPayment:(e,t,n)=>N(`/api/renewal/${e}/pay`,{method:`POST`,body:JSON.stringify({package_id:t,payment_method:n})}),checkPaymentStatus:e=>N(`/api/payment/status/${e}`),tenantInvoices:()=>N(`/api/subscription/invoices`)},P=Be(e=>({user:null,loading:!0,error:null,fetchUser:async()=>{try{e({loading:!0,error:null});let{user:t}=await rt.me();e({user:t,loading:!1})}catch{e({user:null,loading:!1})}},login:async(t,n)=>{try{e({error:null});let{user:r}=await rt.login(t,n);return e({user:r}),!0}catch(t){return e({error:t instanceof Error?t.message:`Login failed`}),!1}},logout:async()=>{e({user:null}),rt.logout().catch(()=>{})}})),it=[{label:`Dashboard`,icon:(0,j.jsx)(b,{size:20}),path:`/dashboard`,permission:`view_dashboard`},{label:`ONU`,icon:(0,j.jsx)(r,{size:20}),permission:`view_dashboard`,children:[{label:`All ONUs`,path:`/dashboard/onus`},{label:`Unconfigured`,path:`/dashboard/onus/unconfigured`,permission:`add_onu`},{label:`Provision ONU`,path:`/dashboard/onus/provision`,permission:`add_onu`},{label:`Pre-config ONT`,path:`/dashboard/onus/pre-config`,permission:`add_onu`},{label:`Register Wizard`,path:`/dashboard/onus/register`,permission:`add_onu`}]},{label:`Templates`,icon:(0,j.jsx)(n,{size:20}),permission:`manage_templates`,children:[{label:`Templates`,path:`/dashboard/templates`,permission:`manage_templates`},{label:`TR069 Profile`,path:`/dashboard/templates/tr069-profile`,permission:`manage_tr069`}]},{label:`Traffic`,icon:(0,j.jsx)(ee,{size:20}),path:`/dashboard/traffic`,permission:`view_dashboard`},{label:`Infrastructure`,icon:(0,j.jsx)(l,{size:20}),permission:`view_dashboard`,children:[{label:`OLT Settings`,path:`/dashboard/settings/olts`,permission:`settings_ip_olts`},{label:`Auto Provision`,path:`/dashboard/settings/auto-provision`,permission:`settings_ip_olts`},{label:`FTTH Overview`,path:`/dashboard/ftth`,permission:`view_dashboard`},{label:`PON Ports`,path:`/dashboard/ftth?tab=pon`,permission:`view_dashboard`},{label:`OTB/ODF`,path:`/dashboard/ftth?tab=otb`,permission:`view_dashboard`},{label:`ODC`,path:`/dashboard/ftth?tab=odc`,permission:`view_dashboard`},{label:`ODP`,path:`/dashboard/ftth?tab=odp`,permission:`view_dashboard`},{label:`FTTH Map`,path:`/dashboard/ftth?tab=map`,permission:`view_dashboard`}]},{label:`System`,icon:(0,j.jsx)(i,{size:20}),permission:void 0,children:[{label:`Customization`,path:`/dashboard/customization`,permission:`customization`},{label:`User Management`,path:`/dashboard/users`,permission:`manage_users`},{label:`Alert Settings`,path:`/dashboard/settings/alerts`,permission:`customization`},{label:`Cloudflare Tunnel`,path:`/dashboard/settings/cloudflare`,permission:`super_admin`},{label:`System Update`,path:`/dashboard/settings/update`,permission:`super_admin`},{label:`Alert History`,path:`/dashboard/alerts/history`,permission:`view_dashboard`}]},{label:`Panduan`,icon:(0,j.jsx)(m,{size:20}),path:`/dashboard/guide`},{label:`Activity Log`,icon:(0,j.jsx)(S,{size:20}),path:`/dashboard/logs`,permission:`manage_users`},{label:`OLT Logs`,icon:(0,j.jsx)(le,{size:20}),path:`/dashboard/olt-logs`,permission:`view_dashboard`}];function at(e){if(!e)return[];let t=new Set(e.permissions||[]),n=n=>!n||e.is_super_admin?!0:n===`super_admin`?t.has(`all_olt`):t.has(`all_olt`)?!0:t.has(n),r=it.map(e=>({...e,children:e.children?.map(e=>({...e}))}));return r=r.filter(e=>n(e.permission)?!e.children||e.children.some(e=>n(e.permission)):!1),r}function ot({collapsed:e,mobileOpen:n,onToggle:r,onMobileClose:i}){let{user:a}=P(),o=he(),s=a?.sidebar_name||`Salfanet NMS`,c=new Set(a?.permissions||[]),l=e=>!e||a?.is_super_admin?!0:e===`super_admin`?c.has(`all_olt`):c.has(`all_olt`)?!0:c.has(e),u=at(a),[d,p]=(0,A.useState)(()=>{let e={},t=window.location.pathname;for(let n of u)n.children?.some(e=>t.startsWith(e.path.split(`?`)[0]))&&(e[n.label]=!0);return e}),m=e=>{p(t=>({...t,[e]:!t[e]}))},h=n||!e;return(0,j.jsxs)(j.Fragment,{children:[n&&(0,j.jsx)(`div`,{className:`fixed inset-0 bg-black/50 z-40 lg:hidden`,onClick:i}),(0,j.jsxs)(`aside`,{className:k(`sidebar-panel fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out`,`bg-surface/95 backdrop-blur-xl border-r border-brd`,e?`lg:w-[70px]`:`lg:w-[260px]`,`w-[260px]`,n?`sidebar-open`:`sidebar-closed`),children:[(0,j.jsxs)(`div`,{className:k(`flex items-center h-16 px-4 border-b border-brd`,h?`justify-between`:`justify-center`),children:[h?(0,j.jsxs)(`div`,{className:`flex items-center gap-2.5 min-w-0`,children:[(0,j.jsx)(`div`,{className:k(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,j.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,j.jsx)(w,{size:18,className:`text-white`})}),(0,j.jsx)(`span`,{className:`text-lg font-bold tracking-tight truncate`,children:s})]}):(0,j.jsx)(`div`,{className:k(`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`,a?.logo_url?`bg-white p-1`:`bg-accent`),children:a?.logo_url?(0,j.jsx)(`img`,{src:a.logo_url,alt:s,className:`w-full h-full object-contain`}):(0,j.jsx)(w,{size:18,className:`text-white`})}),h&&(0,j.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass transition-colors max-lg:hidden flex-shrink-0`,children:(0,j.jsx)(t,{size:18})}),h&&(0,j.jsx)(`button`,{onClick:i,className:`p-1.5 rounded-lg hover:bg-glass transition-colors lg:hidden flex-shrink-0`,children:(0,j.jsx)(C,{size:18})})]}),!h&&(0,j.jsx)(`button`,{onClick:r,className:`hidden lg:flex items-center justify-center w-full py-2 text-tx3 hover:text-tx1 hover:bg-glass transition-colors border-b border-brd`,children:(0,j.jsx)(f,{size:18})}),(0,j.jsx)(`nav`,{className:`flex-1 overflow-y-auto py-4 px-3`,children:u.map(e=>(0,j.jsx)(`div`,{className:`mb-1`,children:e.path?(0,j.jsxs)(ve,{to:e.path,onClick:i,title:h?void 0:e.label,className:({isActive:e})=>k(`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,e?`bg-accent/15 text-accent border border-accent/20`:`text-tx2 hover:text-tx1 hover:bg-glass`,!h&&`justify-center px-2`),children:[e.icon,h&&(0,j.jsx)(`span`,{children:e.label})]}):(0,j.jsxs)(j.Fragment,{children:[(0,j.jsxs)(`button`,{onClick:()=>{let t=e.children?.filter(e=>l(e.permission))||[];!h&&t.length?(o(t[0].path),i()):m(e.label)},title:h?void 0:e.label,className:k(`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all`,`text-tx2 hover:text-tx1 hover:bg-glass`,!h&&`justify-center px-2`),children:[e.icon,h&&(0,j.jsxs)(j.Fragment,{children:[(0,j.jsx)(`span`,{className:`flex-1 text-left`,children:e.label}),d[e.label]?(0,j.jsx)(ce,{size:16}):(0,j.jsx)(f,{size:16})]})]}),h&&d[e.label]&&e.children&&(0,j.jsx)(`div`,{className:`ml-4 mt-1 space-y-0.5 animate-fade-in`,children:e.children.filter(e=>l(e.permission)).map(e=>(0,j.jsxs)(ve,{to:e.path,onClick:i,className:({isActive:e})=>k(`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all`,e?`bg-accent/10 text-accent`:`text-tx3 hover:text-tx2 hover:bg-glass`),children:[(0,j.jsx)(`div`,{className:`w-1.5 h-1.5 rounded-full bg-current opacity-50`}),(0,j.jsx)(`span`,{children:e.label})]},e.path))})]})},e.label))}),h&&(0,j.jsx)(`div`,{className:`px-4 py-3 border-t border-brd`,children:(0,j.jsxs)(`div`,{className:`text-xs text-tx3`,children:[s,` v2.0`]})})]})]})}var st={baseUrl:``,reconnect:!0,maxRetries:10,pingInterval:3e4};function ct(e,t={}){let n={...st,...t},[r,i]=(0,A.useState)(null),[a,o]=(0,A.useState)(!1),[s,c]=(0,A.useState)(!1),l=(0,A.useRef)(null),u=(0,A.useRef)(0),d=(0,A.useRef)(null),f=(0,A.useRef)(null),p=(0,A.useRef)(!0),m=(0,A.useRef)(0),h=(0,A.useCallback)(()=>{if(n.baseUrl)return`${n.baseUrl}${e}`;let t=window.location.protocol===`https:`?`wss:`:`ws:`,r=window.location.hostname,i=window.location.port;return i===``||i===`80`||i===`443`?`${t}//${r}${e}`:`${t}//${r}:${window.__WS_PORT__||`8765`}${e}`},[e,n.baseUrl]),g=(0,A.useCallback)(async()=>{try{let e=await fetch(`/api/ws-token`,{credentials:`include`});if(e.ok)return(await e.json()).token||null}catch{}return null},[]),_=(0,A.useCallback)(()=>{d.current&&=(clearInterval(d.current),null),f.current&&=(clearTimeout(f.current),null),l.current&&=(l.current.onclose=null,l.current.close(),null)},[]),v=(0,A.useCallback)(async()=>{if(!p.current)return;let e=l.current;if(e&&e.readyState===WebSocket.CONNECTING)return;_();let t=++m.current,r=await g();if(!p.current||!r||t!==m.current)return;let a=h(),s=`${a}${a.includes(`?`)?`&`:`?`}token=${encodeURIComponent(r)}`,y=new WebSocket(s);l.current=y;let b=setTimeout(()=>{y.readyState===WebSocket.CONNECTING&&y.close()},1e4);y.addEventListener(`open`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`error`,()=>clearTimeout(b),{once:!0}),y.addEventListener(`close`,()=>clearTimeout(b),{once:!0}),y.onopen=()=>{p.current&&(o(!0),c(!1),u.current=0,d.current=setInterval(()=>{y.readyState===WebSocket.OPEN&&y.send(`ping`)},n.pingInterval))},y.onmessage=e=>{if(p.current)try{let t=JSON.parse(e.data);if(t.event===`server_ping`){y.readyState===WebSocket.OPEN&&y.send(`pong`);return}t.event!==`pong`&&i(t)}catch{}},y.onclose=()=>{if(p.current&&(o(!1),d.current&&=(clearInterval(d.current),null),n.reconnect&&u.current<n.maxRetries)){c(!0);let e=Math.min(1e3*2**u.current,3e4);u.current+=1,f.current=setTimeout(()=>{p.current&&v()},e)}},y.onerror=()=>{}},[h,_,g,n.reconnect,n.maxRetries,n.pingInterval]);return(0,A.useEffect)(()=>(p.current=!0,v(),()=>{p.current=!1,_()}),[v,_]),{lastMessage:r,isConnected:a,isReconnecting:s,send:(0,A.useCallback)(e=>{l.current?.readyState===WebSocket.OPEN&&l.current.send(e)},[]),disconnect:(0,A.useCallback)(()=>{p.current=!1,_(),o(!1),c(!1)},[_])}}var lt=(0,A.createContext)(null);function ut({children:e}){let{lastMessage:t}=ct(`/ws/dashboard`,{reconnect:!0});return(0,j.jsx)(lt.Provider,{value:t,children:e})}function dt(){return(0,A.useContext)(lt)}var ft={critical:{icon:(0,j.jsx)(g,{size:14,className:`text-danger`}),color:`text-danger`},warning:{icon:(0,j.jsx)(g,{size:14,className:`text-warning`}),color:`text-warning`},info:{icon:(0,j.jsx)(re,{size:14,className:`text-info`}),color:`text-info`}},pt={alarm:{icon:a,label:`Network Alarms`,badgeClass:`bg-danger`,iconActiveClass:`text-danger`,headerClass:`text-danger`},unregister:{icon:d,label:`Unregistered ONUs`,badgeClass:`bg-warning`,iconActiveClass:`text-warning`,headerClass:`text-warning`},general:{icon:oe,label:`Notifications`,badgeClass:`bg-accent`,iconActiveClass:`text-accent`,headerClass:`text-accent`}};function mt({type:e,notifs:t,unregData:n,onClose:r,onNavigate:i}){let a=Oe(),s=pt[e].icon,c=Pe({mutationFn:async e=>fetch(`/api/notifications/${e}/read`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>a.invalidateQueries({queryKey:[`notifications`]})}),l=Pe({mutationFn:async()=>fetch(`/api/notifications/read-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>a.invalidateQueries({queryKey:[`notifications`]})}),f=Pe({mutationFn:async e=>fetch(`/api/notifications/${e}/acknowledge`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>a.invalidateQueries({queryKey:[`notifications`]})}),m=Pe({mutationFn:async()=>fetch(`/api/notifications/acknowledge-all?type=${e}`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>a.invalidateQueries({queryKey:[`notifications`]})}),h=Pe({mutationFn:async()=>fetch(`/api/notifications/clear`,{method:`POST`,credentials:`include`,headers:{"X-Requested-With":`XMLHttpRequest`}}),onSuccess:()=>a.invalidateQueries({queryKey:[`notifications`]})}),_=t.filter(e=>!e.is_read&&!e.resolved).length,v=t.filter(e=>!e.resolved),y=t.filter(e=>e.resolved),b={offline:`offline`,offline_batch:`offline`,dyinggasp:`dyinggasp`,dyinggasp_batch:`dyinggasp`,los:`los`,los_batch:`los`,signal:`los`,signal_drop:`los`,signal_drop_batch:`los`},ee=t=>{if(t.is_read||c.mutate(t.id),e===`alarm`){let e=b[t.category];e&&(r(),i(`/dashboard/onus?filter=${e}`))}else e===`unregister`&&(r(),i(`/dashboard/onus/register`))};return(0,j.jsxs)(`div`,{className:`fixed md:absolute left-2 right-2 md:left-auto md:right-0 top-14 md:top-12 w-auto md:w-96 max-h-[80vh] md:max-h-[75vh] rounded-2xl z-50 animate-fade-in overflow-hidden flex flex-col shadow-2xl shadow-black/40 border border-brd`,style:{background:`var(--bg-surface)`,backdropFilter:`blur(20px)`},children:[(0,j.jsxs)(`div`,{className:`flex items-center justify-between px-4 py-3 border-b border-brd`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,j.jsx)(s,{size:16,className:pt[e].headerClass}),(0,j.jsx)(`span`,{className:`font-semibold text-sm`,children:pt[e].label}),_>0&&(0,j.jsx)(`span`,{className:k(`px-2 py-0.5 rounded-full text-[10px] font-bold text-white`,pt[e].badgeClass),children:_})]}),(0,j.jsxs)(`div`,{className:`flex gap-1`,children:[_>0&&(0,j.jsx)(`button`,{onClick:()=>m.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-success transition-colors`,title:`Acknowledge all`,children:(0,j.jsx)(o,{size:14})}),_>0&&(0,j.jsx)(`button`,{onClick:()=>l.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors`,title:`Mark all read`,children:(0,j.jsx)(re,{size:14})}),(0,j.jsx)(`button`,{onClick:()=>h.mutate(),className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-danger transition-colors`,title:`Clear read`,children:(0,j.jsx)(ne,{size:14})}),(0,j.jsx)(`button`,{onClick:r,className:`p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1 transition-colors`,title:`Close`,children:(0,j.jsx)(C,{size:14})})]})]}),e===`unregister`&&n&&n.unregistered>0&&(0,j.jsxs)(`div`,{onClick:()=>{r(),i(`/dashboard/onus/register`)},className:`px-4 py-3 bg-warning/10 border-b border-warning/20 cursor-pointer hover:bg-warning/15 transition-colors group`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,j.jsx)(`div`,{className:`w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0`,children:(0,j.jsx)(d,{size:16,className:`text-warning`})}),(0,j.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,j.jsxs)(`div`,{className:`text-sm font-medium text-warning`,children:[n.unregistered,` Unregistered ONU`,n.unregistered>1?`s`:``]}),(0,j.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5`,children:`Tap to register now`})]}),(0,j.jsx)(ue,{size:16,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]}),n.breakdown.slice(0,3).map((e,t)=>(0,j.jsxs)(`div`,{className:`text-xs text-tx3 mt-1.5 pl-10`,children:[e.olt_name,`: `,e.count,` ONU(s)`]},t))]}),e===`alarm`&&n&&n.offline_dyinggasp>0&&(0,j.jsxs)(`div`,{className:`border-b border-brd/50`,children:[n.dyinggasp_count>0&&(0,j.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=dyinggasp`)},className:`px-4 py-2.5 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors group`,children:(0,j.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,j.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0`,children:(0,j.jsx)(g,{size:14,className:`text-warning`})}),(0,j.jsx)(`div`,{className:`flex-1`,children:(0,j.jsxs)(`span`,{className:`text-xs font-medium text-warning`,children:[n.dyinggasp_count,` ONU`,n.dyinggasp_count>1?`s`:``,` DyingGasp`]})}),(0,j.jsx)(ue,{size:14,className:`text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all`})]})}),n.offline_count>0&&(0,j.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=offline`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,j.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,j.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,j.jsx)(p,{size:14,className:`text-danger`})}),(0,j.jsx)(`div`,{className:`flex-1`,children:(0,j.jsxs)(`span`,{className:`text-xs font-medium text-danger`,children:[n.offline_count,` ONU`,n.offline_count>1?`s`:``,` Offline`]})}),(0,j.jsx)(ue,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})}),n.los_count>0&&(0,j.jsx)(`div`,{onClick:()=>{r(),i(`/dashboard/onus?filter=los`)},className:`px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group`,children:(0,j.jsxs)(`div`,{className:`flex items-center gap-2.5`,children:[(0,j.jsx)(`div`,{className:`w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0`,children:(0,j.jsx)(u,{size:14,className:`text-danger`})}),(0,j.jsx)(`div`,{className:`flex-1`,children:(0,j.jsxs)(`span`,{className:`text-xs font-medium text-danger`,children:[n.los_count,` ONU`,n.los_count>1?`s`:``,` LOS`]})}),(0,j.jsx)(ue,{size:14,className:`text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all`})]})})]}),(0,j.jsx)(`div`,{className:`overflow-y-auto flex-1 max-h-[55vh] md:max-h-[50vh] overscroll-contain`,children:v.length===0&&y.length===0?(0,j.jsxs)(`div`,{className:`py-10 text-center`,children:[(0,j.jsx)(s,{size:28,className:`text-tx3/40 mx-auto mb-2`}),(0,j.jsxs)(`p`,{className:`text-tx3 text-sm`,children:[`No `,pt[e].label.toLowerCase()]})]}):(0,j.jsxs)(j.Fragment,{children:[v.map(e=>{let t=ft[e.severity||`info`]||ft.info,n=e.acknowledged;return(0,j.jsx)(`div`,{onClick:()=>ee(e),className:k(`px-4 py-3 border-b border-brd/50 cursor-pointer hover:bg-glass/50 transition-colors group`,!e.is_read&&`bg-accent/5`,n&&`opacity-60`),children:(0,j.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,j.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:t.icon}),(0,j.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,j.jsx)(`span`,{className:`text-sm font-medium truncate`,children:e.title}),n&&(0,j.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,j.jsx)(o,{size:9}),` ACK`]})]}),(0,j.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-2`,children:e.message.split(`
`)[0]}),(0,j.jsxs)(`div`,{className:`text-[10px] text-tx3/70 mt-1 flex items-center gap-2`,children:[(0,j.jsx)(`span`,{children:e.created_at?new Date(e.created_at).toLocaleString():``}),n&&e.acknowledged_by&&(0,j.jsxs)(`span`,{className:`text-success/70`,children:[`by `,e.acknowledged_by]})]})]}),(0,j.jsxs)(`div`,{className:`flex flex-col items-center gap-1 flex-shrink-0`,children:[!e.is_read&&(0,j.jsx)(`div`,{className:`w-2 h-2 rounded-full bg-accent animate-pulse`}),!n&&(0,j.jsx)(`button`,{onClick:t=>{t.stopPropagation(),f.mutate(e.id)},className:`p-1 rounded hover:bg-success/15 text-tx3 hover:text-success transition-colors opacity-0 group-hover:opacity-100`,title:`Acknowledge`,children:(0,j.jsx)(o,{size:14})})]})]})},e.id)}),y.length>0&&(0,j.jsxs)(j.Fragment,{children:[(0,j.jsxs)(`div`,{className:`px-4 py-1.5 bg-glass/30 border-b border-brd/50 text-[10px] font-medium text-tx3 uppercase tracking-wide`,children:[`Resolved (`,y.length,`)`]}),y.map(e=>(0,j.jsx)(`div`,{onClick:()=>ee(e),className:`px-4 py-2.5 border-b border-brd/50 cursor-pointer hover:bg-glass/30 transition-colors opacity-50`,children:(0,j.jsxs)(`div`,{className:`flex items-start gap-2.5`,children:[(0,j.jsx)(`div`,{className:`mt-0.5 flex-shrink-0`,children:(0,j.jsx)(o,{size:14,className:`text-success`})}),(0,j.jsxs)(`div`,{className:`flex-1 min-w-0`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,j.jsx)(`span`,{className:`text-sm font-medium truncate line-through`,children:e.title}),(0,j.jsxs)(`span`,{className:`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0`,children:[(0,j.jsx)(o,{size:9}),` RESOLVED`]})]}),(0,j.jsx)(`div`,{className:`text-xs text-tx3 mt-0.5 line-clamp-1`,children:e.message.split(`
`)[0]}),(0,j.jsx)(`div`,{className:`text-[10px] text-tx3/70 mt-1`,children:e.resolved_at?`Resolved: ${new Date(e.resolved_at).toLocaleString()}`:``})]})]})},e.id))]})]})})]})}function ht({onMenuClick:e}){let{user:t,logout:n}=P(),[r,i]=(0,A.useState)(!1),[a,o]=(0,A.useState)(null),s=Oe(),c=he(),l=(0,A.useRef)(null),u=(0,A.useRef)(null),{data:d}=Ae({queryKey:[`notifications`],queryFn:async()=>{let e=await fetch(`/api/notifications?limit=50`,{credentials:`include`});return e.ok?e.json():{notifications:[],unread_count:0,alarm_unread:0,unregister_unread:0,general_unread:0}},refetchInterval:1e4}),f=dt();(0,A.useEffect)(()=>{f&&(f.event===`alert`||f.event===`onu_change`)&&(s.invalidateQueries({queryKey:[`notifications`]}),s.invalidateQueries({queryKey:[`unregistered-count`]}))},[f,s]);let{data:p}=Ae({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),m=d?.notifications||[],h=d?.alarm_unread||0,g=d?.unregister_unread||0,_=d?.general_unread||0,v=g+(p?.unregistered||0),y=(0,A.useMemo)(()=>m.filter(e=>e.type===`alarm`),[m]),b=(0,A.useMemo)(()=>m.filter(e=>e.type===`unregister`),[m]),ee=(0,A.useMemo)(()=>m.filter(e=>e.type===`general`),[m]);(0,A.useEffect)(()=>{let e=e=>{l.current&&!l.current.contains(e.target)&&o(null),u.current&&!u.current.contains(e.target)&&i(!1)};return document.addEventListener(`mousedown`,e),()=>document.removeEventListener(`mousedown`,e)},[]);let x=e=>{c(e)},S=(e,t)=>{let n=pt[e],r=n.icon,i=a===e;return(0,j.jsxs)(`button`,{onClick:()=>o(i?null:e),className:k(`relative p-2 rounded-lg hover:bg-glass transition-all active:scale-95`,i&&`bg-glass`),title:n.label,children:[(0,j.jsx)(r,{size:18,className:k(`text-tx2 transition-colors`,i&&n.iconActiveClass)}),t>0&&(0,j.jsx)(`div`,{className:k(`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse-once`,n.badgeClass),children:t>99?`99+`:t})]},e)};return(0,j.jsxs)(`header`,{className:`sticky top-0 z-30 h-14 md:h-16 flex items-center justify-between px-3 md:px-6 bg-surface/80 backdrop-blur-xl border-b border-brd transition-colors duration-300`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,j.jsx)(`button`,{onClick:e,className:`p-2 rounded-lg hover:bg-glass transition-colors lg:hidden active:scale-95`,children:(0,j.jsx)(te,{size:20,className:`text-tx2`})}),(0,j.jsxs)(`div`,{className:`flex items-center gap-1.5 lg:hidden`,children:[(0,j.jsx)(`div`,{className:k(`w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-accent/20 overflow-hidden`,t?.logo_url?`bg-white p-1`:`bg-accent`),children:t?.logo_url?(0,j.jsx)(`img`,{src:t.logo_url,alt:``,className:`w-full h-full object-contain`}):(0,j.jsx)(w,{size:15,className:`text-white`})}),(0,j.jsx)(`span`,{className:`text-sm font-bold tracking-tight`,children:t?.sidebar_name||`Salfanet NMS`})]})]}),(0,j.jsxs)(`div`,{className:`flex items-center gap-1`,children:[(0,j.jsxs)(`div`,{className:`relative flex items-center gap-0.5`,ref:l,children:[S(`alarm`,h),S(`unregister`,v),S(`general`,_),a===`alarm`&&(0,j.jsx)(mt,{type:`alarm`,notifs:y,unregData:p,onClose:()=>o(null),onNavigate:x}),a===`unregister`&&(0,j.jsx)(mt,{type:`unregister`,notifs:b,unregData:p,onClose:()=>o(null),onNavigate:x}),a===`general`&&(0,j.jsx)(mt,{type:`general`,notifs:ee,unregData:p,onClose:()=>o(null),onNavigate:x})]}),(0,j.jsxs)(`div`,{className:`relative`,ref:u,children:[(0,j.jsxs)(`button`,{onClick:()=>i(!r),className:`flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-glass transition-colors active:scale-95`,children:[(0,j.jsx)(`div`,{className:`w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center ring-1 ring-accent/20`,children:(0,j.jsx)(ae,{size:16,className:`text-accent`})}),(0,j.jsxs)(`div`,{className:`text-left hidden sm:block`,children:[(0,j.jsx)(`div`,{className:`text-sm font-medium leading-tight`,children:t?.full_name||`Admin`}),(0,j.jsx)(`div`,{className:`text-[10px] text-tx3 leading-tight`,children:t?.role||`User`})]})]}),r&&(0,j.jsxs)(`div`,{className:`absolute right-0 top-12 w-52 py-1.5 glass-card rounded-xl z-50 animate-fade-in shadow-2xl shadow-black/20`,children:[(0,j.jsxs)(`div`,{className:`px-4 py-2.5 border-b border-brd`,children:[(0,j.jsx)(`div`,{className:`text-sm font-medium`,children:t?.full_name||`Admin`}),(0,j.jsx)(`div`,{className:`text-xs text-tx3`,children:t?.username||``}),t?.is_super_admin&&(0,j.jsx)(`div`,{className:`text-[10px] text-accent font-medium mt-0.5`,children:`Super Admin`})]}),(0,j.jsxs)(`button`,{onClick:()=>{i(!1),c(`/dashboard/profile`)},className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors`,children:[(0,j.jsx)(ae,{size:16,className:`text-tx3`}),` My Profile`]}),(0,j.jsx)(`hr`,{className:`border-brd my-1`}),(0,j.jsxs)(`button`,{onClick:()=>n(),className:`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors`,children:[(0,j.jsx)(se,{size:16}),` Logout`]})]})]})]})]})}function gt(){let[e,t]=(0,A.useState)(navigator.onLine);return(0,A.useEffect)(()=>{let e=()=>t(!0),n=()=>t(!1);return window.addEventListener(`online`,e),window.addEventListener(`offline`,n),()=>{window.removeEventListener(`online`,e),window.removeEventListener(`offline`,n)}},[]),e?null:(0,j.jsxs)(`div`,{className:`fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black text-xs font-medium text-center py-1 flex items-center justify-center gap-1.5`,children:[(0,j.jsx)(p,{size:13}),(0,j.jsx)(`span`,{children:`Koneksi terputus — data tidak dapat diperbarui`})]})}var _t=[{label:`Home`,icon:b,path:`/dashboard`},{label:`ONUs`,icon:r,path:`/dashboard/onus`},{label:`OLT`,icon:l,path:`/dashboard/settings/olts`},{label:`System`,icon:i,path:`/dashboard/customization`}];function vt(){let[e,t]=(0,A.useState)(()=>window.innerWidth<1024),[n,r]=(0,A.useState)(!1),i=pe();(0,A.useEffect)(()=>{r(!1)},[i.pathname]),(0,A.useEffect)(()=>{let e=()=>{window.innerWidth>=1024&&r(!1)};return window.addEventListener(`resize`,e),()=>window.removeEventListener(`resize`,e)},[]);let a=_t,{data:o}=Ae({queryKey:[`unregistered-count`],queryFn:async()=>{let e=await fetch(`/api/unregistered-count`,{credentials:`include`});return e.ok?e.json():{unregistered:0,offline_dyinggasp:0,breakdown:[]}},refetchInterval:6e4}),s=o?.unregistered||0;return(0,j.jsx)(ut,{children:(0,j.jsxs)(`div`,{className:`min-h-screen bg-[var(--bg-primary)] transition-colors duration-300`,children:[(0,j.jsx)(gt,{}),(0,j.jsx)(`div`,{className:`app-mesh-bg`,"aria-hidden":`true`}),(0,j.jsx)(ot,{collapsed:e,mobileOpen:n,onToggle:()=>t(!e),onMobileClose:()=>r(!1)}),(0,j.jsxs)(`div`,{className:k(`relative z-10 transition-all duration-300 min-h-screen`,e?`lg:ml-[70px]`:`lg:ml-[260px]`),children:[(0,j.jsx)(ht,{onMenuClick:()=>r(!n)}),(0,j.jsx)(`main`,{className:`p-3 pb-20 lg:pb-6 md:p-4 lg:p-6 overflow-x-hidden max-w-[100vw]`,children:(0,j.jsx)(fe,{})})]}),(0,j.jsx)(`nav`,{className:`fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-xl border-t border-brd lg:hidden mobile-bottom-nav`,children:(0,j.jsx)(`div`,{className:`flex items-center justify-around h-14 px-1`,children:a.map(e=>{let t=e.icon;return(0,j.jsx)(ve,{to:e.path,className:({isActive:e})=>k(`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all relative`,e?`text-accent`:`text-tx3`),children:({isActive:n})=>(0,j.jsxs)(j.Fragment,{children:[(0,j.jsxs)(`div`,{className:k(`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all`,n?`bg-accent/15 scale-105`:`scale-100`),children:[(0,j.jsx)(t,{size:20,strokeWidth:n?2.2:1.8}),e.path===`/dashboard/onus`&&s>0&&(0,j.jsx)(`div`,{className:`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-warning text-white text-[9px] font-bold flex items-center justify-center`,children:s>9?`9+`:s})]}),(0,j.jsx)(`span`,{children:e.label})]})},e.path)})})})]})})}var yt=class extends A.Component{constructor(e){super(e),this.state={hasError:!1,error:null}}static getDerivedStateFromError(e){return{hasError:!0,error:e}}componentDidCatch(e,t){console.error(`ErrorBoundary caught:`,e,t)}handleReload=()=>{this.setState({hasError:!1,error:null}),window.location.reload()};render(){return this.state.hasError?(0,j.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4`,children:(0,j.jsxs)(`div`,{className:`max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center`,children:[(0,j.jsx)(`div`,{className:`mb-4 text-5xl`,children:`⚠️`}),(0,j.jsx)(`h1`,{className:`text-xl font-bold text-[var(--tx-primary)] mb-2`,children:`Something went wrong`}),(0,j.jsx)(`p`,{className:`text-sm text-[var(--tx-tertiary)] mb-4`,children:this.state.error?.message||`An unexpected error occurred.`}),(0,j.jsx)(`button`,{onClick:this.handleReload,className:`px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition`,children:`Reload Page`})]})}):this.props.children}};function bt(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function xt(e){if(Array.isArray(e))return e}function St(e){if(Array.isArray(e))return bt(e)}function Ct(e,t){if(!(e instanceof t))throw TypeError(`Cannot call a class as a function`)}function wt(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,`value`in r&&(r.writable=!0),Object.defineProperty(e,Pt(r.key),r)}}function Tt(e,t,n){return t&&wt(e.prototype,t),n&&wt(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}function Et(e,t){var n=typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(!n){if(Array.isArray(e)||(n=It(e))||t&&e&&typeof e.length==`number`){n&&(e=n);var r=0,i=function(){};return{s:i,n:function(){return r>=e.length?{done:!0}:{done:!1,value:e[r++]}},e:function(e){throw e},f:i}}throw TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}var a,o=!0,s=!1;return{s:function(){n=n.call(e)},n:function(){var e=n.next();return o=e.done,e},e:function(e){s=!0,a=e},f:function(){try{o||n.return==null||n.return()}finally{if(s)throw a}}}}function F(e,t,n){return(t=Pt(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function Dt(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function Ot(e,t){var n=e==null?null:typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(n!=null){var r,i,a,o,s=[],c=!0,l=!1;try{if(a=(n=n.call(e)).next,t===0){if(Object(n)!==n)return;c=!1}else for(;!(c=(r=a.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){l=!0,i=e}finally{try{if(!c&&n.return!=null&&(o=n.return(),Object(o)!==o))return}finally{if(l)throw i}}return s}}function kt(){throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function At(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function jt(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function I(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?jt(Object(n),!0).forEach(function(t){F(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):jt(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function Mt(e,t){return xt(e)||Ot(e,t)||It(e,t)||kt()}function L(e){return St(e)||Dt(e)||It(e)||At()}function Nt(e,t){if(typeof e!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(typeof r!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function Pt(e){var t=Nt(e,`string`);return typeof t==`symbol`?t:t+``}function Ft(e){"@babel/helpers - typeof";return Ft=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},Ft(e)}function It(e,t){if(e){if(typeof e==`string`)return bt(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?bt(e,t):void 0}}var Lt=function(){},Rt={},zt={},Bt=null,Vt={mark:Lt,measure:Lt};try{typeof window<`u`&&(Rt=window),typeof document<`u`&&(zt=document),typeof MutationObserver<`u`&&(Bt=MutationObserver),typeof performance<`u`&&(Vt=performance)}catch{}var Ht=(Rt.navigator||{}).userAgent,Ut=Ht===void 0?``:Ht,R=Rt,z=zt,Wt=Bt,Gt=Vt;R.document;var B=!!z.documentElement&&!!z.head&&typeof z.addEventListener==`function`&&typeof z.createElement==`function`,Kt=~Ut.indexOf(`MSIE`)||~Ut.indexOf(`Trident/`),qt,Jt=/fa(k|kd|s|r|l|t|d|dr|dl|dt|b|slr|slpr|wsb|tl|ns|nds|es|gt|jr|jfr|jdr|usb|ufsb|udsb|cr|ss|sr|sl|st|sds|sdr|sdl|sdt|sldr|slpdr|pr|ms|vs)?[\-\ ]/,Yt=/Font ?Awesome ?([567 ]*)(Solid|Regular|Light|Thin|Duotone|Brands|Free|Pro|Sharp Duotone|Sharp|Kit|Notdog Duo|Notdog|Chisel|Etch|Graphite|Thumbprint|Jelly Fill|Jelly Duo|Jelly|Utility|Utility Fill|Utility Duo|Slab Press|Slab|Slab Duo|Slab Press Duo|Pixel|Mosaic|Vellum|Whiteboard)?.*/i,Xt={classic:{fa:`solid`,fas:`solid`,"fa-solid":`solid`,far:`regular`,"fa-regular":`regular`,fal:`light`,"fa-light":`light`,fat:`thin`,"fa-thin":`thin`,fab:`brands`,"fa-brands":`brands`},duotone:{fa:`solid`,fad:`solid`,"fa-solid":`solid`,"fa-duotone":`solid`,fadr:`regular`,"fa-regular":`regular`,fadl:`light`,"fa-light":`light`,fadt:`thin`,"fa-thin":`thin`},sharp:{fa:`solid`,fass:`solid`,"fa-solid":`solid`,fasr:`regular`,"fa-regular":`regular`,fasl:`light`,"fa-light":`light`,fast:`thin`,"fa-thin":`thin`},"sharp-duotone":{fa:`solid`,fasds:`solid`,"fa-solid":`solid`,fasdr:`regular`,"fa-regular":`regular`,fasdl:`light`,"fa-light":`light`,fasdt:`thin`,"fa-thin":`thin`},slab:{"fa-regular":`regular`,faslr:`regular`},"slab-press":{"fa-regular":`regular`,faslpr:`regular`},"slab-duo":{"fa-regular":`regular`,fasldr:`regular`},"slab-press-duo":{"fa-regular":`regular`,faslpdr:`regular`},thumbprint:{"fa-light":`light`,fatl:`light`},vellum:{"fa-solid":`solid`,favs:`solid`},pixel:{"fa-regular":`regular`,fapr:`regular`},mosaic:{"fa-solid":`solid`,fams:`solid`},whiteboard:{"fa-semibold":`semibold`,fawsb:`semibold`},notdog:{"fa-solid":`solid`,fans:`solid`},"notdog-duo":{"fa-solid":`solid`,fands:`solid`},etch:{"fa-solid":`solid`,faes:`solid`},graphite:{"fa-thin":`thin`,fagt:`thin`},jelly:{"fa-regular":`regular`,fajr:`regular`},"jelly-fill":{"fa-regular":`regular`,fajfr:`regular`},"jelly-duo":{"fa-regular":`regular`,fajdr:`regular`},chisel:{"fa-regular":`regular`,facr:`regular`},utility:{"fa-semibold":`semibold`,fausb:`semibold`},"utility-duo":{"fa-semibold":`semibold`,faudsb:`semibold`},"utility-fill":{"fa-semibold":`semibold`,faufsb:`semibold`}},Zt={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},Qt=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`],V=`classic`,$t=`duotone`,en=`sharp`,tn=`sharp-duotone`,nn=`chisel`,rn=`etch`,an=`graphite`,on=`jelly`,sn=`jelly-duo`,cn=`jelly-fill`,ln=`mosaic`,un=`notdog`,dn=`notdog-duo`,fn=`pixel`,pn=`slab`,mn=`slab-duo`,hn=`slab-press`,gn=`slab-press-duo`,_n=`thumbprint`,vn=`utility`,yn=`utility-duo`,bn=`utility-fill`,xn=`vellum`,Sn=`whiteboard`,Cn=`Classic`,wn=`Duotone`,Tn=`Sharp`,En=`Sharp Duotone`,Dn=`Chisel`,On=`Etch`,kn=`Graphite`,An=`Jelly`,jn=`Jelly Duo`,Mn=`Jelly Fill`,Nn=`Mosaic`,Pn=`Notdog`,Fn=`Notdog Duo`,In=`Pixel`,Ln=`Slab`,Rn=`Slab Duo`,zn=`Slab Press`,Bn=`Slab Press Duo`,Vn=`Thumbprint`,Hn=`Utility`,Un=`Utility Duo`,Wn=`Utility Fill`,Gn=`Vellum`,Kn=`Whiteboard`,qn=[V,$t,en,tn,nn,rn,an,on,sn,cn,ln,un,dn,fn,pn,mn,hn,gn,_n,vn,yn,bn,xn,Sn];qt={},F(F(F(F(F(F(F(F(F(F(qt,V,Cn),$t,wn),en,Tn),tn,En),nn,Dn),rn,On),an,kn),on,An),sn,jn),cn,Mn),F(F(F(F(F(F(F(F(F(F(qt,ln,Nn),un,Pn),dn,Fn),fn,In),pn,Ln),mn,Rn),hn,zn),gn,Bn),_n,Vn),vn,Hn),F(F(F(F(qt,yn,Un),bn,Wn),xn,Gn),Sn,Kn);var Jn={classic:{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},duotone:{900:`fad`,400:`fadr`,300:`fadl`,100:`fadt`},sharp:{900:`fass`,400:`fasr`,300:`fasl`,100:`fast`},"sharp-duotone":{900:`fasds`,400:`fasdr`,300:`fasdl`,100:`fasdt`},slab:{400:`faslr`},"slab-press":{400:`faslpr`},"slab-duo":{400:`fasldr`},"slab-press-duo":{400:`faslpdr`},vellum:{900:`favs`},mosaic:{900:`fams`},pixel:{400:`fapr`},whiteboard:{600:`fawsb`},thumbprint:{300:`fatl`},notdog:{900:`fans`},"notdog-duo":{900:`fands`},etch:{900:`faes`},graphite:{100:`fagt`},chisel:{400:`facr`},jelly:{400:`fajr`},"jelly-fill":{400:`fajfr`},"jelly-duo":{400:`fajdr`},utility:{600:`fausb`},"utility-duo":{600:`faudsb`},"utility-fill":{600:`faufsb`}},Yn={"Font Awesome 7 Free":{900:`fas`,400:`far`},"Font Awesome 7 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`,100:`fat`},"Font Awesome 7 Brands":{400:`fab`,normal:`fab`},"Font Awesome 7 Duotone":{900:`fad`,400:`fadr`,normal:`fadr`,300:`fadl`,100:`fadt`},"Font Awesome 7 Sharp":{900:`fass`,400:`fasr`,normal:`fasr`,300:`fasl`,100:`fast`},"Font Awesome 7 Sharp Duotone":{900:`fasds`,400:`fasdr`,normal:`fasdr`,300:`fasdl`,100:`fasdt`},"Font Awesome 7 Jelly":{400:`fajr`,normal:`fajr`},"Font Awesome 7 Jelly Fill":{400:`fajfr`,normal:`fajfr`},"Font Awesome 7 Jelly Duo":{400:`fajdr`,normal:`fajdr`},"Font Awesome 7 Slab":{400:`faslr`,normal:`faslr`},"Font Awesome 7 Slab Press":{400:`faslpr`,normal:`faslpr`},"Font Awesome 7 Slab Duo":{400:`fasldr`,normal:`fasldr`},"Font Awesome 7 Slab Press Duo":{400:`faslpdr`,normal:`faslpdr`},"Font Awesome 7 Pixel":{400:`fapr`,normal:`fapr`},"Font Awesome 7 Mosaic":{900:`fams`,normal:`fams`},"Font Awesome 7 Vellum":{900:`favs`,normal:`favs`},"Font Awesome 7 Thumbprint":{300:`fatl`,normal:`fatl`},"Font Awesome 7 Notdog":{900:`fans`,normal:`fans`},"Font Awesome 7 Notdog Duo":{900:`fands`,normal:`fands`},"Font Awesome 7 Etch":{900:`faes`,normal:`faes`},"Font Awesome 7 Graphite":{100:`fagt`,normal:`fagt`},"Font Awesome 7 Chisel":{400:`facr`,normal:`facr`},"Font Awesome 7 Whiteboard":{600:`fawsb`,normal:`fawsb`},"Font Awesome 7 Utility":{600:`fausb`,normal:`fausb`},"Font Awesome 7 Utility Duo":{600:`faudsb`,normal:`faudsb`},"Font Awesome 7 Utility Fill":{600:`faufsb`,normal:`faufsb`}},Xn=new Map([[`classic`,{defaultShortPrefixId:`fas`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`,`brands`],futureStyleIds:[],defaultFontWeight:900}],[`duotone`,{defaultShortPrefixId:`fad`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp`,{defaultShortPrefixId:`fass`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`sharp-duotone`,{defaultShortPrefixId:`fasds`,defaultStyleId:`solid`,styleIds:[`solid`,`regular`,`light`,`thin`],futureStyleIds:[],defaultFontWeight:900}],[`chisel`,{defaultShortPrefixId:`facr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`etch`,{defaultShortPrefixId:`faes`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`graphite`,{defaultShortPrefixId:`fagt`,defaultStyleId:`thin`,styleIds:[`thin`],futureStyleIds:[],defaultFontWeight:100}],[`jelly`,{defaultShortPrefixId:`fajr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-duo`,{defaultShortPrefixId:`fajdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`jelly-fill`,{defaultShortPrefixId:`fajfr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`mosaic`,{defaultShortPrefixId:`fams`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog`,{defaultShortPrefixId:`fans`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`notdog-duo`,{defaultShortPrefixId:`fands`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`pixel`,{defaultShortPrefixId:`fapr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab`,{defaultShortPrefixId:`faslr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-duo`,{defaultShortPrefixId:`fasldr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press`,{defaultShortPrefixId:`faslpr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`slab-press-duo`,{defaultShortPrefixId:`faslpdr`,defaultStyleId:`regular`,styleIds:[`regular`],futureStyleIds:[],defaultFontWeight:400}],[`thumbprint`,{defaultShortPrefixId:`fatl`,defaultStyleId:`light`,styleIds:[`light`],futureStyleIds:[],defaultFontWeight:300}],[`utility`,{defaultShortPrefixId:`fausb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-duo`,{defaultShortPrefixId:`faudsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`utility-fill`,{defaultShortPrefixId:`faufsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}],[`vellum`,{defaultShortPrefixId:`favs`,defaultStyleId:`solid`,styleIds:[`solid`],futureStyleIds:[],defaultFontWeight:900}],[`whiteboard`,{defaultShortPrefixId:`fawsb`,defaultStyleId:`semibold`,styleIds:[`semibold`],futureStyleIds:[],defaultFontWeight:600}]]),Zn={chisel:{regular:`facr`},classic:{brands:`fab`,light:`fal`,regular:`far`,solid:`fas`,thin:`fat`},duotone:{light:`fadl`,regular:`fadr`,solid:`fad`,thin:`fadt`},etch:{solid:`faes`},graphite:{thin:`fagt`},jelly:{regular:`fajr`},"jelly-duo":{regular:`fajdr`},"jelly-fill":{regular:`fajfr`},mosaic:{solid:`fams`},notdog:{solid:`fans`},"notdog-duo":{solid:`fands`},pixel:{regular:`fapr`},sharp:{light:`fasl`,regular:`fasr`,solid:`fass`,thin:`fast`},"sharp-duotone":{light:`fasdl`,regular:`fasdr`,solid:`fasds`,thin:`fasdt`},slab:{regular:`faslr`},"slab-duo":{regular:`fasldr`},"slab-press":{regular:`faslpr`},"slab-press-duo":{regular:`faslpdr`},thumbprint:{light:`fatl`},utility:{semibold:`fausb`},"utility-duo":{semibold:`faudsb`},"utility-fill":{semibold:`faufsb`},vellum:{solid:`favs`},whiteboard:{semibold:`fawsb`}},Qn=[`fak`,`fa-kit`,`fakd`,`fa-kit-duotone`],$n={kit:{fak:`kit`,"fa-kit":`kit`},"kit-duotone":{fakd:`kit-duotone`,"fa-kit-duotone":`kit-duotone`}},er=[`kit`];F(F({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var tr={kit:{"fa-kit":`fak`},"kit-duotone":{"fa-kit-duotone":`fakd`}},nr={"Font Awesome Kit":{400:`fak`,normal:`fak`},"Font Awesome Kit Duotone":{400:`fakd`,normal:`fakd`}},rr={kit:{fak:`fa-kit`},"kit-duotone":{fakd:`fa-kit-duotone`}},ir={kit:{kit:`fak`},"kit-duotone":{"kit-duotone":`fakd`}},ar,or={GROUP:`duotone-group`,SWAP_OPACITY:`swap-opacity`,PRIMARY:`primary`,SECONDARY:`secondary`},sr=[`fa-classic`,`fa-duotone`,`fa-sharp`,`fa-sharp-duotone`,`fa-thumbprint`,`fa-whiteboard`,`fa-notdog`,`fa-notdog-duo`,`fa-chisel`,`fa-etch`,`fa-graphite`,`fa-jelly`,`fa-jelly-fill`,`fa-jelly-duo`,`fa-slab`,`fa-slab-press`,`fa-slab-press-duo`,`fa-slab-duo`,`fa-mosaic`,`fa-pixel`,`fa-vellum`,`fa-utility`,`fa-utility-duo`,`fa-utility-fill`];ar={},F(F(F(F(F(F(F(F(F(F(ar,`classic`,`Classic`),`duotone`,`Duotone`),`sharp`,`Sharp`),`sharp-duotone`,`Sharp Duotone`),`chisel`,`Chisel`),`etch`,`Etch`),`graphite`,`Graphite`),`jelly`,`Jelly`),`jelly-duo`,`Jelly Duo`),`jelly-fill`,`Jelly Fill`),F(F(F(F(F(F(F(F(F(F(ar,`mosaic`,`Mosaic`),`notdog`,`Notdog`),`notdog-duo`,`Notdog Duo`),`pixel`,`Pixel`),`slab`,`Slab`),`slab-duo`,`Slab Duo`),`slab-press`,`Slab Press`),`slab-press-duo`,`Slab Press Duo`),`thumbprint`,`Thumbprint`),`utility`,`Utility`),F(F(F(F(ar,`utility-duo`,`Utility Duo`),`utility-fill`,`Utility Fill`),`vellum`,`Vellum`),`whiteboard`,`Whiteboard`),F(F({},`kit`,`Kit`),`kit-duotone`,`Kit Duotone`);var cr={classic:{"fa-brands":`fab`,"fa-duotone":`fad`,"fa-light":`fal`,"fa-regular":`far`,"fa-solid":`fas`,"fa-thin":`fat`},duotone:{"fa-regular":`fadr`,"fa-light":`fadl`,"fa-thin":`fadt`},sharp:{"fa-solid":`fass`,"fa-regular":`fasr`,"fa-light":`fasl`,"fa-thin":`fast`},"sharp-duotone":{"fa-solid":`fasds`,"fa-regular":`fasdr`,"fa-light":`fasdl`,"fa-thin":`fasdt`},slab:{"fa-regular":`faslr`},"slab-press":{"fa-regular":`faslpr`},"slab-duo":{"fa-regular":`fasldr`},"slab-press-duo":{"fa-regular":`faslpdr`},pixel:{"fa-regular":`fapr`},mosaic:{"fa-solid":`fams`},vellum:{"fa-solid":`favs`},whiteboard:{"fa-semibold":`fawsb`},thumbprint:{"fa-light":`fatl`},notdog:{"fa-solid":`fans`},"notdog-duo":{"fa-solid":`fands`},etch:{"fa-solid":`faes`},graphite:{"fa-thin":`fagt`},jelly:{"fa-regular":`fajr`},"jelly-fill":{"fa-regular":`fajfr`},"jelly-duo":{"fa-regular":`fajdr`},chisel:{"fa-regular":`facr`},utility:{"fa-semibold":`fausb`},"utility-duo":{"fa-semibold":`faudsb`},"utility-fill":{"fa-semibold":`faufsb`}},lr={classic:[`fas`,`far`,`fal`,`fat`,`fad`],duotone:[`fadr`,`fadl`,`fadt`],sharp:[`fass`,`fasr`,`fasl`,`fast`],"sharp-duotone":[`fasds`,`fasdr`,`fasdl`,`fasdt`],slab:[`faslr`],"slab-press":[`faslpr`],"slab-duo":[`fasldr`],"slab-press-duo":[`faslpdr`],pixel:[`fapr`],mosaic:[`fams`],vellum:[`favs`],whiteboard:[`fawsb`],thumbprint:[`fatl`],notdog:[`fans`],"notdog-duo":[`fands`],etch:[`faes`],graphite:[`fagt`],jelly:[`fajr`],"jelly-fill":[`fajfr`],"jelly-duo":[`fajdr`],chisel:[`facr`],utility:[`fausb`],"utility-duo":[`faudsb`],"utility-fill":[`faufsb`]},ur={classic:{fab:`fa-brands`,fad:`fa-duotone`,fal:`fa-light`,far:`fa-regular`,fas:`fa-solid`,fat:`fa-thin`},duotone:{fadr:`fa-regular`,fadl:`fa-light`,fadt:`fa-thin`},sharp:{fass:`fa-solid`,fasr:`fa-regular`,fasl:`fa-light`,fast:`fa-thin`},"sharp-duotone":{fasds:`fa-solid`,fasdr:`fa-regular`,fasdl:`fa-light`,fasdt:`fa-thin`},slab:{faslr:`fa-regular`},"slab-press":{faslpr:`fa-regular`},"slab-duo":{fasldr:`fa-regular`},"slab-press-duo":{faslpdr:`fa-regular`},pixel:{fapr:`fa-regular`},mosaic:{fams:`fa-solid`},vellum:{favs:`fa-solid`},whiteboard:{fawsb:`fa-semibold`},thumbprint:{fatl:`fa-light`},notdog:{fans:`fa-solid`},"notdog-duo":{fands:`fa-solid`},etch:{faes:`fa-solid`},graphite:{fagt:`fa-thin`},jelly:{fajr:`fa-regular`},"jelly-fill":{fajfr:`fa-regular`},"jelly-duo":{fajdr:`fa-regular`},chisel:{facr:`fa-regular`},utility:{fausb:`fa-semibold`},"utility-duo":{faudsb:`fa-semibold`},"utility-fill":{faufsb:`fa-semibold`}},dr=`fa.fas.far.fal.fat.fad.fadr.fadl.fadt.fab.fass.fasr.fasl.fast.fasds.fasdr.fasdl.fasdt.faslr.faslpr.fasldr.faslpdr.fapr.fams.favs.fawsb.fatl.fans.fands.faes.fagt.fajr.fajfr.fajdr.facr.fausb.faudsb.faufsb`.split(`.`).concat(sr,[`fa-solid`,`fa-regular`,`fa-light`,`fa-thin`,`fa-duotone`,`fa-brands`,`fa-semibold`]),fr=[`solid`,`regular`,`light`,`thin`,`duotone`,`brands`,`semibold`],pr=[1,2,3,4,5,6,7,8,9,10],mr=pr.concat([11,12,13,14,15,16,17,18,19,20]),hr=[].concat(L(Object.keys(lr)),fr,[`aw`,`fw`,`pull-left`,`pull-right`],[`2xs`,`xs`,`sm`,`lg`,`xl`,`2xl`,`beat`,`beat-fade`,`border`,`bounce`,`buzz`,`canvas-square`,`canvas-roomy`,`fade`,`flip-360`,`flip-both`,`flip-horizontal`,`flip-vertical`,`flip`,`float`,`inverse`,`jello`,`layers`,`layers-bottom-left`,`layers-bottom-right`,`layers-counter`,`layers-text`,`layers-top-left`,`layers-top-right`,`li`,`pull-end`,`pull-start`,`pulse`,`rotate-180`,`rotate-270`,`rotate-90`,`rotate-by`,`shake`,`spin-pulse`,`spin-reverse`,`spin`,`spin-snap`,`spin-snap-4`,`spin-snap-8`,`stack-1x`,`stack-2x`,`stack`,`swing`,`ul`,`wag`,`width-auto`,`width-fixed`,or.GROUP,or.SWAP_OPACITY,or.PRIMARY,or.SECONDARY],pr.map(function(e){return`${e}x`}),mr.map(function(e){return`w-${e}`})),gr={"Font Awesome 5 Free":{900:`fas`,400:`far`},"Font Awesome 5 Pro":{900:`fas`,400:`far`,normal:`far`,300:`fal`},"Font Awesome 5 Brands":{400:`fab`,normal:`fab`},"Font Awesome 5 Duotone":{900:`fad`}},H=`___FONT_AWESOME___`,_r=16,vr=`fa`,yr=`svg-inline--fa`,U=`data-fa-i2svg`,br=`data-fa-pseudo-element`,xr=`data-fa-pseudo-element-pending`,Sr=`data-prefix`,Cr=`data-icon`,wr=`fontawesome-i2svg`,Tr=`async`,Er=[`HTML`,`HEAD`,`STYLE`,`SCRIPT`],Dr=[`::before`,`::after`,`:before`,`:after`],Or=function(){try{return!0}catch{return!1}}();function kr(e){return new Proxy(e,{get:function(e,t){return t in e?e[t]:e[V]}})}var Ar=I({},Xt);Ar[V]=I(I(I(I({},{"fa-duotone":`duotone`}),Xt[V]),$n.kit),$n[`kit-duotone`]);var jr=kr(Ar),Mr=I({},Zn);Mr[V]=I(I(I(I({},{duotone:`fad`}),Mr[V]),ir.kit),ir[`kit-duotone`]);var Nr=kr(Mr),Pr=I({},ur);Pr[V]=I(I({},Pr[V]),rr.kit);var Fr=kr(Pr),Ir=I({},cr);Ir[V]=I(I({},Ir[V]),tr.kit),kr(Ir);var Lr=Jt,Rr=`fa-layers-text`,zr=Yt;kr(I({},Jn));var Br=[`class`,`data-prefix`,`data-icon`,`data-fa-transform`,`data-fa-mask`],Vr=Zt,Hr=[].concat(L(er),L(hr)),Ur=R.FontAwesomeConfig||{};function Wr(e){var t=z.querySelector(`script[`+e+`]`);if(t)return t.getAttribute(e)}function Gr(e){return e===``?!0:e===`false`?!1:e===`true`||e}z&&typeof z.querySelector==`function`&&[[`data-family-prefix`,`familyPrefix`],[`data-css-prefix`,`cssPrefix`],[`data-family-default`,`familyDefault`],[`data-style-default`,`styleDefault`],[`data-replacement-class`,`replacementClass`],[`data-auto-replace-svg`,`autoReplaceSvg`],[`data-auto-add-css`,`autoAddCss`],[`data-search-pseudo-elements`,`searchPseudoElements`],[`data-search-pseudo-elements-warnings`,`searchPseudoElementsWarnings`],[`data-search-pseudo-elements-full-scan`,`searchPseudoElementsFullScan`],[`data-observe-mutations`,`observeMutations`],[`data-mutate-approach`,`mutateApproach`],[`data-keep-original-source`,`keepOriginalSource`],[`data-measure-performance`,`measurePerformance`],[`data-show-missing-icons`,`showMissingIcons`]].forEach(function(e){var t=Mt(e,2),n=t[0],r=t[1],i=Gr(Wr(n));i!=null&&(Ur[r]=i)});var Kr={styleDefault:`solid`,familyDefault:V,cssPrefix:vr,replacementClass:yr,autoReplaceSvg:!0,autoAddCss:!0,searchPseudoElements:!1,searchPseudoElementsWarnings:!0,searchPseudoElementsFullScan:!1,observeMutations:!0,mutateApproach:`async`,keepOriginalSource:!0,measurePerformance:!1,showMissingIcons:!0};Ur.familyPrefix&&(Ur.cssPrefix=Ur.familyPrefix);var qr=I(I({},Kr),Ur);qr.autoReplaceSvg||(qr.observeMutations=!1);var W={};Object.keys(Kr).forEach(function(e){Object.defineProperty(W,e,{enumerable:!0,set:function(t){qr[e]=t,Jr.forEach(function(e){return e(W)})},get:function(){return qr[e]}})}),Object.defineProperty(W,"familyPrefix",{enumerable:!0,set:function(e){qr.cssPrefix=e,Jr.forEach(function(e){return e(W)})},get:function(){return qr.cssPrefix}}),R.FontAwesomeConfig=W;var Jr=[];function Yr(e){return Jr.push(e),function(){Jr.splice(Jr.indexOf(e),1)}}var G=_r,K={size:16,x:0,y:0,rotate:0,flipX:!1,flipY:!1};function Xr(e){if(!(!e||!B)){var t=z.createElement(`style`);t.setAttribute(`type`,`text/css`),t.innerHTML=e;for(var n=z.head.childNodes,r=null,i=n.length-1;i>-1;i--){var a=n[i],o=(a.tagName||``).toUpperCase();[`STYLE`,`LINK`].indexOf(o)>-1&&(r=a)}return z.head.insertBefore(t,r),e}}var Zr=`0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`;function Qr(){for(var e=12,t=``;e-->0;)t+=Zr[Math.random()*62|0];return t}function $r(e){for(var t=[],n=(e||[]).length>>>0;n--;)t[n]=e[n];return t}function ei(e){return e.classList?$r(e.classList):(e.getAttribute(`class`)||``).split(` `).filter(function(e){return e})}function ti(e){return`${e}`.replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function ni(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}="${ti(e[n])}" `},``).trim()}function ri(e){return Object.keys(e||{}).reduce(function(t,n){return t+`${n}: ${e[n].trim()};`},``)}function ii(e){return e.size!==K.size||e.x!==K.x||e.y!==K.y||e.rotate!==K.rotate||e.flipX||e.flipY}function ai(e){var t=e.transform,n=e.containerWidth,r=e.iconWidth;return{outer:{transform:`translate(${n/2} 256)`},inner:{transform:`${`translate(${t.x*32}, ${t.y*32}) `} ${`scale(${t.size/16*(t.flipX?-1:1)}, ${t.size/16*(t.flipY?-1:1)}) `} ${`rotate(${t.rotate} 0 0)`}`},path:{transform:`translate(${r/2*-1} -256)`}}}function oi(e){var t=e.transform,n=e.width,r=n===void 0?_r:n,i=e.height,a=i===void 0?_r:i,o=e.startCentered,s=o!==void 0&&o,c=``;return c+=s&&Kt?`translate(${t.x/G-r/2}em, ${t.y/G-a/2}em) `:s?`translate(calc(-50% + ${t.x/G}em), calc(-50% + ${t.y/G}em)) `:`translate(${t.x/G}em, ${t.y/G}em) `,c+=`scale(${t.size/G*(t.flipX?-1:1)}, ${t.size/G*(t.flipY?-1:1)}) `,c+=`rotate(${t.rotate}deg) `,c}var si=`:root, :host {
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
}`;function ci(){var e=vr,t=yr,n=W.cssPrefix,r=W.replacementClass,i=si;if(n!==e||r!==t){var a=RegExp(`\\.${e}\\-`,`g`),o=RegExp(`\\--${e}\\-`,`g`),s=RegExp(`\\.${t}`,`g`);i=i.replace(a,`.${n}-`).replace(o,`--${n}-`).replace(s,`.${r}`)}return i}var li=!1;function ui(){W.autoAddCss&&!li&&(Xr(ci()),li=!0)}var di={mixout:function(){return{dom:{css:ci,insertCss:ui}}},hooks:function(){return{beforeDOMElementCreation:function(){ui()},beforeI2svg:function(){ui()}}}},q=R||{};q[H]||(q[H]={}),q[H].styles||(q[H].styles={}),q[H].hooks||(q[H].hooks={}),q[H].shims||(q[H].shims=[]);var J=q[H],fi=[],pi=function(){z.removeEventListener(`DOMContentLoaded`,pi),mi=1,fi.map(function(e){return e()})},mi=!1;B&&(mi=(z.documentElement.doScroll?/^loaded|^c/:/^loaded|^i|^c/).test(z.readyState),mi||z.addEventListener(`DOMContentLoaded`,pi));function hi(e){B&&(mi?setTimeout(e,0):fi.push(e))}function gi(e){var t=e.tag,n=e.attributes,r=n===void 0?{}:n,i=e.children,a=i===void 0?[]:i;return typeof e==`string`?ti(e):`<${t} ${ni(r)}>${a.map(gi).join(``)}</${t}>`}function _i(e,t,n){if(e&&e[t]&&e[t][n])return{prefix:t,iconName:n,icon:e[t][n]}}var vi=function(e,t){return function(n,r,i,a){return e.call(t,n,r,i,a)}},yi=function(e,t,n,r){var i=Object.keys(e),a=i.length,o=r===void 0?t:vi(t,r),s,c,l;for(n===void 0?(s=1,l=e[i[0]]):(s=0,l=n);s<a;s++)c=i[s],l=o(l,e[c],c,e);return l};function bi(e){return L(e).length===1?e.codePointAt(0).toString(16):null}function xi(e){return Object.keys(e).reduce(function(t,n){var r=e[n];return r.icon?t[r.iconName]=r.icon:t[n]=r,t},{})}function Si(e,t){var n=(arguments.length>2&&arguments[2]!==void 0?arguments[2]:{}).skipHooks,r=n!==void 0&&n,i=xi(t);typeof J.hooks.addPack==`function`&&!r?J.hooks.addPack(e,xi(t)):J.styles[e]=I(I({},J.styles[e]||{}),i),e===`fas`&&Si(`fa`,t)}var Ci=J.styles,wi=J.shims,Ti=Object.keys(Fr),Ei=Ti.reduce(function(e,t){return e[t]=Object.keys(Fr[t]),e},{}),Di=null,Oi={},ki={},Ai={},ji={},Mi={};function Ni(e){return~Hr.indexOf(e)}function Pi(e,t){var n=t.split(`-`),r=n[0],i=n.slice(1).join(`-`);return r===e&&i!==``&&!Ni(i)?i:null}var Fi=function(){var e=function(e){return yi(Ci,function(t,n,r){return t[r]=yi(n,e,{}),t},{})};Oi=e(function(e,t,n){return t[3]&&(e[t[3]]=n),t[2]&&t[2].filter(function(e){return typeof e==`number`}).forEach(function(t){e[t.toString(16)]=n}),e}),ki=e(function(e,t,n){return e[n]=n,t[2]&&t[2].filter(function(e){return typeof e==`string`}).forEach(function(t){e[t]=n}),e}),Mi=e(function(e,t,n){var r=t[2];return e[n]=n,r.forEach(function(t){e[t]=n}),e});var t=`far`in Ci||W.autoFetchSvg,n=yi(wi,function(e,n){var r=n[0],i=n[1],a=n[2];return i===`far`&&!t&&(i=`fas`),typeof r==`string`&&(e.names[r]={prefix:i,iconName:a}),typeof r==`number`&&(e.unicodes[r.toString(16)]={prefix:i,iconName:a}),e},{names:{},unicodes:{}});Ai=n.names,ji=n.unicodes,Di=Ui(W.styleDefault,{family:W.familyDefault})};Yr(function(e){Di=Ui(e.styleDefault,{family:W.familyDefault})}),Fi();function Ii(e,t){return(Oi[e]||{})[t]}function Li(e,t){return(ki[e]||{})[t]}function Ri(e,t){return(Mi[e]||{})[t]}function zi(e){return Ai[e]||{prefix:null,iconName:null}}function Bi(e){var t=ji[e],n=Ii(`fas`,e);return t||(n?{prefix:`fas`,iconName:n}:null)||{prefix:null,iconName:null}}function Y(){return Di}var Vi=function(){return{prefix:null,iconName:null,rest:[]}};function Hi(e){var t=V,n=Ti.reduce(function(e,t){return e[t]=`${W.cssPrefix}-${t}`,e},{});return qn.forEach(function(r){(e.includes(n[r])||e.some(function(e){return Ei[r].includes(e)}))&&(t=r)}),t}function Ui(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).family,n=t===void 0?V:t,r=jr[n][e];if(n===$t&&!e)return`fad`;var i=Nr[n][e]||Nr[n][r],a=e in J.styles?e:null;return i||a||null}function Wi(e){var t=[],n=null;return e.forEach(function(e){var r=Pi(W.cssPrefix,e);r?n=r:e&&t.push(e)}),{iconName:n,rest:t}}function Gi(e){return e.sort().filter(function(e,t,n){return n.indexOf(e)===t})}var Ki=dr.concat(Qn);function qi(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).skipLookups,n=t!==void 0&&t,r=null,i=Gi(e.filter(function(e){return Ki.includes(e)})),a=Gi(e.filter(function(e){return!Ki.includes(e)})),o=Mt(i.filter(function(e){return r=e,!Qt.includes(e)}),1)[0],s=o===void 0?null:o,c=Hi(i),l=I(I({},Wi(a)),{},{prefix:Ui(s,{family:c})});return I(I(I({},l),Zi({values:e,family:c,styles:Ci,config:W,canonical:l,givenPrefix:r})),Ji(n,r,l))}function Ji(e,t,n){var r=n.prefix,i=n.iconName;if(e||!r||!i)return{prefix:r,iconName:i};var a=t===`fa`?zi(i):{},o=Ri(r,i);return i=a.iconName||o||i,r=a.prefix||r,r===`far`&&!Ci.far&&Ci.fas&&!W.autoFetchSvg&&(r=`fas`),{prefix:r,iconName:i}}var Yi=qn.filter(function(e){return e!==V||e!==$t}),Xi=Object.keys(ur).filter(function(e){return e!==V}).map(function(e){return Object.keys(ur[e])}).flat();function Zi(e){var t=e.values,n=e.family,r=e.canonical,i=e.givenPrefix,a=i===void 0?``:i,o=e.styles,s=o===void 0?{}:o,c=e.config,l=c===void 0?{}:c,u=n===$t,d=t.includes(`fa-duotone`)||t.includes(`fad`),f=l.familyDefault===`duotone`,p=r.prefix===`fad`||r.prefix===`fa-duotone`;return!u&&(d||f||p)&&(r.prefix=`fad`),(t.includes(`fa-brands`)||t.includes(`fab`))&&(r.prefix=`fab`),!r.prefix&&Yi.includes(n)&&(Object.keys(s).find(function(e){return Xi.includes(e)})||l.autoFetchSvg)&&(r.prefix=Xn.get(n).defaultShortPrefixId,r.iconName=Ri(r.prefix,r.iconName)||r.iconName),(r.prefix===`fa`||a===`fa`)&&(r.prefix=Y()||`fas`),r}var Qi=function(){function e(){Ct(this,e),this.definitions={}}return Tt(e,[{key:`add`,value:function(){var e=this,t=[...arguments].reduce(this._pullDefinitions,{});Object.keys(t).forEach(function(n){e.definitions[n]=I(I({},e.definitions[n]||{}),t[n]),Si(n,t[n]);var r=Fr[V][n];r&&Si(r,t[n]),Fi()})}},{key:`reset`,value:function(){this.definitions={}}},{key:`_pullDefinitions`,value:function(e,t){var n=t.prefix&&t.iconName&&t.icon?{0:t}:t;return Object.keys(n).map(function(t){var r=n[t],i=r.prefix,a=r.iconName,o=r.icon,s=o[2];e[i]||(e[i]={}),s.length>0&&s.forEach(function(t){typeof t==`string`&&(e[i][t]=o)}),e[i][a]=o}),e}}])}(),$i=[],ea={},ta={},na=Object.keys(ta);function ra(e,t){var n=t.mixoutsTo;return $i=e,ea={},Object.keys(ta).forEach(function(e){na.indexOf(e)===-1&&delete ta[e]}),$i.forEach(function(e){var t=e.mixout?e.mixout():{};if(Object.keys(t).forEach(function(e){typeof t[e]==`function`&&(n[e]=t[e]),Ft(t[e])===`object`&&Object.keys(t[e]).forEach(function(r){n[e]||(n[e]={}),n[e][r]=t[e][r]})}),e.hooks){var r=e.hooks();Object.keys(r).forEach(function(e){ea[e]||(ea[e]=[]),ea[e].push(r[e])})}e.provides&&e.provides(ta)}),n}function ia(e,t){var n=[...arguments].slice(2);return(ea[e]||[]).forEach(function(e){t=e.apply(null,[t].concat(n))}),t}function aa(e){var t=[...arguments].slice(1);(ea[e]||[]).forEach(function(e){e.apply(null,t)})}function X(){var e=arguments[0],t=Array.prototype.slice.call(arguments,1);return ta[e]?ta[e].apply(null,t):void 0}function oa(e){e.prefix===`fa`&&(e.prefix=`fas`);var t=e.iconName,n=e.prefix||Y();if(t)return t=Ri(n,t)||t,_i(sa.definitions,n,t)||_i(J.styles,n,t)}var sa=new Qi,Z={noAuto:function(){W.autoReplaceSvg=!1,W.observeMutations=!1,aa(`noAuto`)},config:W,dom:{i2svg:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return B?(aa(`beforeI2svg`,e),X(`pseudoElements2svg`,e),X(`i2svg`,e)):Promise.reject(Error(`Operation requires a DOM of some kind.`))},watch:function(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{},t=e.autoReplaceSvgRoot;W.autoReplaceSvg===!1&&(W.autoReplaceSvg=!0),W.observeMutations=!0,hi(function(){ca({autoReplaceSvgRoot:t}),aa(`watch`,e)})}},parse:{icon:function(e){if(e===null)return null;if(Ft(e)===`object`&&e.prefix&&e.iconName)return{prefix:e.prefix,iconName:Ri(e.prefix,e.iconName)||e.iconName};if(Array.isArray(e)&&e.length===2){var t=e[1].indexOf(`fa-`)===0?e[1].slice(3):e[1],n=Ui(e[0]);return{prefix:n,iconName:Ri(n,t)||t}}if(typeof e==`string`&&(e.indexOf(`${W.cssPrefix}-`)>-1||e.match(Lr))){var r=qi(e.split(` `),{skipLookups:!0});return{prefix:r.prefix||Y(),iconName:Ri(r.prefix,r.iconName)||r.iconName}}if(typeof e==`string`){var i=Y();return{prefix:i,iconName:Ri(i,e)||e}}}},library:sa,findIconDefinition:oa,toHtml:gi},ca=function(){var e=(arguments.length>0&&arguments[0]!==void 0?arguments[0]:{}).autoReplaceSvgRoot,t=e===void 0?z:e;(Object.keys(J.styles).length>0||W.autoFetchSvg)&&B&&W.autoReplaceSvg&&Z.dom.i2svg({node:t})};function la(e,t){return Object.defineProperty(e,"abstract",{get:t}),Object.defineProperty(e,"html",{get:function(){return e.abstract.map(function(e){return gi(e)})}}),Object.defineProperty(e,"node",{get:function(){if(B){var t=z.createElement(`div`);return t.innerHTML=e.html,t.children}}}),e}function ua(e){var t=e.children,n=e.main,r=e.mask,i=e.attributes,a=e.styles,o=e.transform;if(ii(o)&&n.found&&!r.found){var s={x:n.width/n.height/2,y:.5};i.style=ri(I(I({},a),{},{"transform-origin":`${s.x+o.x/16}em ${s.y+o.y/16}em`}))}return[{tag:`svg`,attributes:i,children:t}]}function da(e){var t=e.prefix,n=e.iconName,r=e.children,i=e.attributes,a=e.symbol,o=a===!0?`${t}-${W.cssPrefix}-${n}`:a;return[{tag:`svg`,attributes:{style:`display: none;`},children:[{tag:`symbol`,attributes:I(I({},i),{},{id:o}),children:r}]}]}function fa(e){return[`aria-label`,`aria-labelledby`,`title`,`role`].some(function(t){return t in e})}function pa(e){var t=e.icons,n=t.main,r=t.mask,i=e.prefix,a=e.iconName,o=e.transform,s=e.symbol,c=e.maskId,l=e.extra,u=e.watchable,d=u!==void 0&&u,f=r.found?r:n,p=f.width,m=f.height,h=[W.replacementClass,a?`${W.cssPrefix}-${a}`:``].filter(function(e){return l.classes.indexOf(e)===-1}).filter(function(e){return e!==``||!!e}).concat(l.classes).join(` `),g={children:[],attributes:I(I({},l.attributes),{},{"data-prefix":i,"data-icon":a,class:h,role:l.attributes.role||`img`,viewBox:`0 0 ${p} ${m}`})};!fa(l.attributes)&&!l.attributes[`aria-hidden`]&&(g.attributes[`aria-hidden`]=`true`),d&&(g.attributes[U]=``);var _=I(I({},g),{},{prefix:i,iconName:a,main:n,mask:r,maskId:c,transform:o,symbol:s,styles:I({},l.styles)}),v=r.found&&n.found?X(`generateAbstractMask`,_)||{children:[],attributes:{}}:X(`generateAbstractIcon`,_)||{children:[],attributes:{}},y=v.children,b=v.attributes;return _.children=y,_.attributes=b,s?da(_):ua(_)}function ma(e){var t=e.content,n=e.width,r=e.height,i=e.transform,a=e.extra,o=e.watchable,s=o!==void 0&&o,c=I(I({},a.attributes),{},{class:a.classes.join(` `)});s&&(c[U]=``);var l=I({},a.styles);ii(i)&&(l.transform=oi({transform:i,startCentered:!0,width:n,height:r}),l[`-webkit-transform`]=l.transform);var u=ri(l);u.length>0&&(c.style=u);var d=[];return d.push({tag:`span`,attributes:c,children:[t]}),d}function ha(e){var t=e.content,n=e.extra,r=I(I({},n.attributes),{},{class:n.classes.join(` `)}),i=ri(n.styles);i.length>0&&(r.style=i);var a=[];return a.push({tag:`span`,attributes:r,children:[t]}),a}var ga=J.styles;function _a(e){var t=e[0],n=e[1],r=Mt(e.slice(4),1)[0],i=null;return i=Array.isArray(r)?{tag:`g`,attributes:{class:`${W.cssPrefix}-${Vr.GROUP}`},children:[{tag:`path`,attributes:{class:`${W.cssPrefix}-${Vr.SECONDARY}`,fill:`currentColor`,d:r[0]}},{tag:`path`,attributes:{class:`${W.cssPrefix}-${Vr.PRIMARY}`,fill:`currentColor`,d:r[1]}}]}:{tag:`path`,attributes:{fill:`currentColor`,d:r}},{found:!0,width:t,height:n,icon:i}}var va={found:!1,width:512,height:512};function ya(e,t){!Or&&!W.showMissingIcons&&e&&console.error(`Icon with name "${e}" and prefix "${t}" is missing.`)}function ba(e,t){var n=t;return t===`fa`&&W.styleDefault!==null&&(t=Y()),new Promise(function(r,i){if(n===`fa`){var a=zi(e)||{};e=a.iconName||e,t=a.prefix||t}if(e&&t&&ga[t]&&ga[t][e]){var o=ga[t][e];return r(_a(o))}ya(e,t),r(I(I({},va),{},{icon:W.showMissingIcons&&e&&X(`missingIconAbstract`)||{}}))})}var xa=function(){},Sa=W.measurePerformance&&Gt&&Gt.mark&&Gt.measure?Gt:{mark:xa,measure:xa},Ca=`FA "7.3.1"`,wa=function(e){return Sa.mark(`${Ca} ${e} begins`),function(){return Ta(e)}},Ta=function(e){Sa.mark(`${Ca} ${e} ends`),Sa.measure(`${Ca} ${e}`,`${Ca} ${e} begins`,`${Ca} ${e} ends`)},Ea={begin:wa,end:Ta},Da=function(){};function Oa(e){return typeof(e.getAttribute?e.getAttribute(U):null)==`string`}function ka(e){var t=e.getAttribute?e.getAttribute(Sr):null,n=e.getAttribute?e.getAttribute(Cr):null;return t&&n}function Aa(e){return e&&e.classList&&e.classList.contains&&e.classList.contains(W.replacementClass)}function ja(){return W.autoReplaceSvg===!0?Ia.replace:Ia[W.autoReplaceSvg]||Ia.replace}function Ma(e){return z.createElementNS(`http://www.w3.org/2000/svg`,e)}function Na(e){return z.createElement(e)}function Pa(e){var t=(arguments.length>1&&arguments[1]!==void 0?arguments[1]:{}).ceFn,n=t===void 0?e.tag===`svg`?Ma:Na:t;if(typeof e==`string`)return z.createTextNode(e);var r=n(e.tag);return Object.keys(e.attributes||[]).forEach(function(t){r.setAttribute(t,e.attributes[t])}),(e.children||[]).forEach(function(e){r.appendChild(Pa(e,{ceFn:n}))}),r}function Fa(e){var t=` ${e.outerHTML} `;return t=`${t}Font Awesome fontawesome.com `,t}var Ia={replace:function(e){var t=e[0];if(t.parentNode){if(e[1].forEach(function(e){t.parentNode.insertBefore(Pa(e),t)}),t.getAttribute(U)===null&&W.keepOriginalSource){var n=z.createComment(Fa(t));t.parentNode.replaceChild(n,t)}else t.remove()}},nest:function(e){var t=e[0],n=e[1];if(~ei(t).indexOf(W.replacementClass))return Ia.replace(e);var r=RegExp(`${W.cssPrefix}-.*`);if(delete n[0].attributes.id,n[0].attributes.class){var i=n[0].attributes.class.split(` `).reduce(function(e,t){return t===W.replacementClass||t.match(r)?e.toSvg.push(t):e.toNode.push(t),e},{toNode:[],toSvg:[]});n[0].attributes.class=i.toSvg.join(` `),i.toNode.length===0?t.removeAttribute(`class`):t.setAttribute(`class`,i.toNode.join(` `))}var a=n.map(function(e){return gi(e)}).join(`
`);t.setAttribute(U,``),t.innerHTML=a}};function La(e){e()}function Ra(e,t){var n=typeof t==`function`?t:Da;if(e.length===0)n();else{var r=La;W.mutateApproach===Tr&&(r=R.requestAnimationFrame||La),r(function(){var t=ja(),r=Ea.begin(`mutate`);e.map(t),r(),n()})}}var za=!1;function Ba(){za=!0}function Va(){za=!1}var Ha=null;function Ua(e){if(Wt&&W.observeMutations){var t=e.treeCallback,n=t===void 0?Da:t,r=e.nodeCallback,i=r===void 0?Da:r,a=e.pseudoElementsCallback,o=a===void 0?Da:a,s=e.observeMutationsRoot,c=s===void 0?z:s;Ha=new Wt(function(e){if(!za){var t=Y();$r(e).forEach(function(e){if(e.type===`childList`&&e.addedNodes.length>0&&!Oa(e.addedNodes[0])&&(W.searchPseudoElements&&o(e.target),n(e.target)),e.type===`attributes`&&e.target.parentNode&&W.searchPseudoElements&&o([e.target],!0),e.type===`attributes`&&Oa(e.target)&&~Br.indexOf(e.attributeName)){if(e.attributeName===`class`&&ka(e.target)){var r=qi(ei(e.target)),a=r.prefix,s=r.iconName;e.target.setAttribute(Sr,a||t),s&&e.target.setAttribute(Cr,s)}else Aa(e.target)&&i(e.target)}})}}),B&&Ha.observe(c,{childList:!0,attributes:!0,characterData:!0,subtree:!0})}}function Wa(){Ha&&Ha.disconnect()}function Ga(e){var t=e.getAttribute(`style`),n=[];return t&&(n=t.split(`;`).reduce(function(e,t){var n=t.split(`:`),r=n[0],i=n.slice(1);return r&&i.length>0&&(e[r]=i.join(`:`).trim()),e},{})),n}function Ka(e){var t=e.getAttribute(`data-prefix`),n=e.getAttribute(`data-icon`),r=e.innerText===void 0?``:e.innerText.trim(),i=qi(ei(e));return i.prefix||=Y(),t&&n&&(i.prefix=t,i.iconName=n),i.iconName&&i.prefix?i:(i.prefix&&r.length>0&&(i.iconName=Li(i.prefix,e.innerText)||Ii(i.prefix,bi(e.innerText))),!i.iconName&&W.autoFetchSvg&&e.firstChild&&e.firstChild.nodeType===Node.TEXT_NODE&&(i.iconName=e.firstChild.data),i)}function qa(e){return $r(e.attributes).reduce(function(e,t){return e.name!==`class`&&e.name!==`style`&&(e[t.name]=t.value),e},{})}function Ja(){return{iconName:null,prefix:null,transform:K,symbol:!1,mask:{iconName:null,prefix:null,rest:[]},maskId:null,extra:{classes:[],styles:{},attributes:{}}}}function Ya(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{styleParser:!0},n=Ka(e),r=n.iconName,i=n.prefix,a=n.rest,o=qa(e),s=ia(`parseNodeAttributes`,{},e);return I({iconName:r,prefix:i,transform:K,mask:{iconName:null,prefix:null,rest:[]},maskId:null,symbol:!1,extra:{classes:a,styles:t.styleParser?Ga(e):[],attributes:o}},s)}var Xa=J.styles;function Za(e){var t=W.autoReplaceSvg===`nest`?Ya(e,{styleParser:!1}):Ya(e);return~t.extra.classes.indexOf(Rr)?X(`generateLayersText`,e,t):X(`generateSvgReplacementMutation`,e,t)}function Qa(){return[].concat(L(Qn),L(dr))}function $a(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;if(!B)return Promise.resolve();var n=z.documentElement.classList,r=function(e){return n.add(`${wr}-${e}`)},i=function(e){return n.remove(`${wr}-${e}`)},a=W.autoFetchSvg?Qa():Qt.concat(Object.keys(Xa));a.includes(`fa`)||a.push(`fa`);var o=[`.${Rr}:not([${U}])`].concat(a.map(function(e){return`.${e}:not([${U}])`})).join(`, `);if(o.length===0)return Promise.resolve();var s=[];try{s=$r(e.querySelectorAll(o))}catch{}if(s.length>0)r(`pending`),i(`complete`);else return Promise.resolve();var c=Ea.begin(`onTree`),l=s.reduce(function(e,t){try{var n=Za(t);n&&e.push(n)}catch(e){Or||e.name===`MissingIcon`&&console.error(e)}return e},[]);return new Promise(function(e,n){Promise.all(l).then(function(n){Ra(n,function(){r(`active`),r(`complete`),i(`pending`),typeof t==`function`&&t(),c(),e()})}).catch(function(e){c(),n(e)})})}function eo(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:null;Za(e).then(function(e){e&&Ra([e],t)})}function to(e){return function(t){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},r=(t||{}).icon?t:oa(t||{}),i=n.mask;return i&&=(i||{}).icon?i:oa(i||{}),e(r,I(I({},n),{},{mask:i}))}}var no=function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?K:n,i=t.symbol,a=i!==void 0&&i,o=t.mask,s=o===void 0?null:o,c=t.maskId,l=c===void 0?null:c,u=t.classes,d=u===void 0?[]:u,f=t.attributes,p=f===void 0?{}:f,m=t.styles,h=m===void 0?{}:m;if(e){var g=e.prefix,_=e.iconName,v=e.icon;return la(I({type:`icon`},e),function(){return aa(`beforeDOMElementCreation`,{iconDefinition:e,params:t}),pa({icons:{main:_a(v),mask:s?_a(s.icon):{found:!1,width:null,height:null,icon:{}}},prefix:g,iconName:_,transform:I(I({},K),r),symbol:a,maskId:l,extra:{attributes:p,styles:h,classes:d}})})}},ro={mixout:function(){return{icon:to(no)}},hooks:function(){return{mutationObserverCallbacks:function(e){return e.treeCallback=$a,e.nodeCallback=eo,e}}},provides:function(e){e.i2svg=function(e){var t=e.node,n=t===void 0?z:t,r=e.callback;return $a(n,r===void 0?function(){}:r)},e.generateSvgReplacementMutation=function(e,t){var n=t.iconName,r=t.prefix,i=t.transform,a=t.symbol,o=t.mask,s=t.maskId,c=t.extra;return new Promise(function(t,l){Promise.all([ba(n,r),o.iconName?ba(o.iconName,o.prefix):Promise.resolve({found:!1,width:512,height:512,icon:{}})]).then(function(o){var l=Mt(o,2),u=l[0],d=l[1];t([e,pa({icons:{main:u,mask:d},prefix:r,iconName:n,transform:i,symbol:a,maskId:s,extra:c,watchable:!0})])}).catch(l)})},e.generateAbstractIcon=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.transform,a=e.styles,o=ri(a);o.length>0&&(n.style=o);var s;return ii(i)&&(s=X(`generateAbstractTransformGrouping`,{main:r,transform:i,containerWidth:r.width,iconWidth:r.width})),t.push(s||r.icon),{children:t,attributes:n}}}},io={mixout:function(){return{layer:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.classes,r=n===void 0?[]:n;return la({type:`layer`},function(){aa(`beforeDOMElementCreation`,{assembler:e,params:t});var n=[];return e(function(e){Array.isArray(e)?e.map(function(e){n=n.concat(e.abstract)}):n=n.concat(e.abstract)}),[{tag:`span`,attributes:{class:[`${W.cssPrefix}-layers`].concat(L(r)).join(` `)},children:n}]})}}}},ao={mixout:function(){return{counter:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.title,r=n===void 0?null:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return la({type:`counter`,content:e},function(){return aa(`beforeDOMElementCreation`,{content:e,params:t}),ha({content:e.toString(),title:r,extra:{attributes:s,styles:l,classes:[`${W.cssPrefix}-layers-counter`].concat(L(a))}})})}}}},oo={mixout:function(){return{text:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=t.transform,r=n===void 0?K:n,i=t.classes,a=i===void 0?[]:i,o=t.attributes,s=o===void 0?{}:o,c=t.styles,l=c===void 0?{}:c;return la({type:`text`,content:e},function(){return aa(`beforeDOMElementCreation`,{content:e,params:t}),ma({content:e,transform:I(I({},K),r),extra:{attributes:s,styles:l,classes:[`${W.cssPrefix}-layers-text`].concat(L(a))}})})}}},provides:function(e){e.generateLayersText=function(e,t){var n=t.transform,r=t.extra,i=null,a=null;if(Kt){var o=parseInt(getComputedStyle(e).fontSize,10),s=e.getBoundingClientRect();i=s.width/o,a=s.height/o}return Promise.resolve([e,ma({content:e.innerHTML,width:i,height:a,transform:n,extra:r,watchable:!0})])}}},so=RegExp(`"`,`ug`),co=[1105920,1112319],lo=I(I(I(I({},{FontAwesome:{normal:`fas`,400:`fas`}}),Yn),gr),nr),uo=Object.keys(lo).reduce(function(e,t){return e[t.toLowerCase()]=lo[t],e},{}),fo=Object.keys(uo).reduce(function(e,t){var n=uo[t];return e[t]=n[900]||L(Object.entries(n))[0][1],e},{});function po(e){return bi(L(e.replace(so,``))[0]||``)}function mo(e){var t=e.getPropertyValue(`font-feature-settings`).includes(`ss01`),n=e.getPropertyValue(`content`).replace(so,``),r=n.codePointAt(0),i=r>=co[0]&&r<=co[1],a=n.length===2&&n[0]===n[1];return i||a||t}function ho(e,t){var n=e.replace(/^['"]|['"]$/g,``).toLowerCase(),r=parseInt(t),i=isNaN(r)?`normal`:r;return(uo[n]||{})[i]||fo[n]}function go(e,t){var n=`${xr}${t.replace(`:`,`-`)}`;return new Promise(function(r,i){if(e.getAttribute(n)!==null)return r();var a=$r(e.children).filter(function(e){return e.getAttribute(br)===t})[0],o=R.getComputedStyle(e,t),s=o.getPropertyValue(`font-family`),c=s.match(zr),l=o.getPropertyValue(`font-weight`),u=o.getPropertyValue(`content`);if(a&&!c)return e.removeChild(a),r();if(c&&u!==`none`&&u!==``){var d=o.getPropertyValue(`content`),f=ho(s,l),p=po(d),m=c[0].startsWith(`FontAwesome`),h=mo(o),g=Ii(f,p),_=g;if(m){var v=Bi(p);v.iconName&&v.prefix&&(g=v.iconName,f=v.prefix)}if(g&&!h&&(!a||a.getAttribute(Sr)!==f||a.getAttribute(Cr)!==_)){e.setAttribute(n,_),a&&e.removeChild(a);var y=Ja(),b=y.extra;b.attributes[br]=t,ba(g,f).then(function(i){var a=pa(I(I({},y),{},{icons:{main:i,mask:Vi()},prefix:f,iconName:_,extra:b,watchable:!0})),o=z.createElementNS(`http://www.w3.org/2000/svg`,`svg`);t===`::before`?e.insertBefore(o,e.firstChild):e.appendChild(o),o.outerHTML=a.map(function(e){return gi(e)}).join(`
`),e.removeAttribute(n),r()}).catch(i)}else r()}else r()})}function _o(e){return Promise.all([go(e,`::before`),go(e,`::after`)])}function vo(e){return e.parentNode!==document.head&&!~Er.indexOf(e.tagName.toUpperCase())&&!e.getAttribute(br)&&(!e.parentNode||e.parentNode.tagName!==`svg`)}var yo=function(e){return!!e&&Dr.some(function(t){return e.includes(t)})},bo=function(e){if(!e)return[];var t=new Set,n=e.split(/,(?![^()]*\))/).map(function(e){return e.trim()});n=n.flatMap(function(e){return e.includes(`(`)?e:e.split(`,`).map(function(e){return e.trim()})});var r=Et(n),i;try{for(r.s();!(i=r.n()).done;){var a=i.value;if(yo(a)){var o=Dr.reduce(function(e,t){return e.replace(t,``)},a);o!==``&&o!==`*`&&t.add(o)}}}catch(e){r.e(e)}finally{r.f()}return t};function xo(e){var t=arguments.length>1&&arguments[1]!==void 0&&arguments[1];if(B){var n;if(t)n=e;else if(W.searchPseudoElementsFullScan)n=e.querySelectorAll(`*`);else{var r=new Set,i=Et(document.styleSheets),a;try{for(i.s();!(a=i.n()).done;){var o=a.value;try{var s=Et(o.cssRules),c;try{for(s.s();!(c=s.n()).done;){var l=c.value,u=Et(bo(l.selectorText)),d;try{for(u.s();!(d=u.n()).done;){var f=d.value;r.add(f)}}catch(e){u.e(e)}finally{u.f()}}}catch(e){s.e(e)}finally{s.f()}}catch(e){W.searchPseudoElementsWarnings&&console.warn(`Font Awesome: cannot parse stylesheet: ${o.href} (${e.message})
If it declares any Font Awesome CSS pseudo-elements, they will not be rendered as SVG icons. Add crossorigin="anonymous" to the <link>, enable searchPseudoElementsFullScan for slower but more thorough DOM parsing, or suppress this warning by setting searchPseudoElementsWarnings to false.`)}}}catch(e){i.e(e)}finally{i.f()}if(!r.size)return;var p=Array.from(r).join(`, `);try{n=e.querySelectorAll(p)}catch{}}return new Promise(function(e,t){var r=$r(n).filter(vo).map(_o),i=Ea.begin(`searchPseudoElements`);Ba(),Promise.all(r).then(function(){i(),Va(),e()}).catch(function(){i(),Va(),t()})})}}var So={hooks:function(){return{mutationObserverCallbacks:function(e){return e.pseudoElementsCallback=xo,e}}},provides:function(e){e.pseudoElements2svg=function(e){var t=e.node,n=t===void 0?z:t;W.searchPseudoElements&&xo(n)}}},Co=!1,wo={mixout:function(){return{dom:{unwatch:function(){Ba(),Co=!0}}}},hooks:function(){return{bootstrap:function(){Ua(ia(`mutationObserverCallbacks`,{}))},noAuto:function(){Wa()},watch:function(e){var t=e.observeMutationsRoot;Co?Va():Ua(ia(`mutationObserverCallbacks`,{observeMutationsRoot:t}))}}}},To=function(e){return e.toLowerCase().split(` `).reduce(function(e,t){var n=t.toLowerCase().split(`-`),r=n[0],i=n.slice(1).join(`-`);if(r&&i===`h`)return e.flipX=!0,e;if(r&&i===`v`)return e.flipY=!0,e;if(i=parseFloat(i),isNaN(i))return e;switch(r){case`grow`:e.size+=i;break;case`shrink`:e.size-=i;break;case`left`:e.x-=i;break;case`right`:e.x+=i;break;case`up`:e.y-=i;break;case`down`:e.y+=i;break;case`rotate`:e.rotate+=i}return e},{size:16,x:0,y:0,flipX:!1,flipY:!1,rotate:0})},Eo={mixout:function(){return{parse:{transform:function(e){return To(e)}}}},hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-transform`);return n&&(e.transform=To(n)),e}}},provides:function(e){e.generateAbstractTransformGrouping=function(e){var t=e.main,n=e.transform,r=e.containerWidth,i=e.iconWidth,a={outer:{transform:`translate(${r/2} 256)`},inner:{transform:`${`translate(${n.x*32}, ${n.y*32}) `} ${`scale(${n.size/16*(n.flipX?-1:1)}, ${n.size/16*(n.flipY?-1:1)}) `} ${`rotate(${n.rotate} 0 0)`}`},path:{transform:`translate(${i/2*-1} -256)`}};return{tag:`g`,attributes:I({},a.outer),children:[{tag:`g`,attributes:I({},a.inner),children:[{tag:t.icon.tag,children:t.icon.children,attributes:I(I({},t.icon.attributes),a.path)}]}]}}}},Do={x:0,y:0,width:`100%`,height:`100%`};function Oo(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!0;return e.attributes&&(e.attributes.fill||t)&&(e.attributes.fill=`black`),e}function ko(e){return e.tag===`g`?e.children:[e]}ra([di,ro,io,ao,oo,So,wo,Eo,{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-mask`),r=n?qi(n.split(` `).map(function(e){return e.trim()})):Vi();return r.prefix||=Y(),e.mask=r,e.maskId=t.getAttribute(`data-fa-mask-id`),e}}},provides:function(e){e.generateAbstractMask=function(e){var t=e.children,n=e.attributes,r=e.main,i=e.mask,a=e.maskId,o=e.transform,s=r.width,c=r.icon,l=i.width,u=i.icon,d=ai({transform:o,containerWidth:l,iconWidth:s}),f={tag:`rect`,attributes:I(I({},Do),{},{fill:`white`})},p=c.children?{children:c.children.map(Oo)}:{},m={tag:`g`,attributes:I({},d.inner),children:[Oo(I({tag:c.tag,attributes:I(I({},c.attributes),d.path)},p))]},h={tag:`g`,attributes:I({},d.outer),children:[m]},g=`mask-${a||Qr()}`,_=`clip-${a||Qr()}`,v={tag:`mask`,attributes:I(I({},Do),{},{id:g,maskUnits:`userSpaceOnUse`,maskContentUnits:`userSpaceOnUse`}),children:[f,h]},y={tag:`defs`,children:[{tag:`clipPath`,attributes:{id:_},children:ko(u)},v]};return t.push(y,{tag:`rect`,attributes:I({fill:`currentColor`,"clip-path":`url(#${_})`,mask:`url(#${g})`},Do)}),{children:t,attributes:n}}}},{provides:function(e){var t=!1;R.matchMedia&&(t=R.matchMedia(`(prefers-reduced-motion: reduce)`).matches),e.missingIconAbstract=function(){var e=[],n={fill:`currentColor`},r={attributeType:`XML`,repeatCount:`indefinite`,dur:`2s`};e.push({tag:`path`,attributes:I(I({},n),{},{d:`M156.5,447.7l-12.6,29.5c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7C127.6,430.5,141.5,440,156.5,447.7z M40.6,272H8.5 c1.4,21.2,5.4,41.7,11.7,61.1L50,321.2C45.1,305.5,41.8,289,40.6,272z M40.6,240c1.4-18.8,5.2-37,11.1-54.1l-29.5-12.6 C14.7,194.3,10,216.7,8.5,240H40.6z M64.3,156.5c7.8-14.9,17.2-28.8,28.1-41.5L69.7,92.3c-13.7,15.6-25.5,32.8-34.9,51.5 L64.3,156.5z M397,419.6c-13.9,12-29.4,22.3-46.1,30.4l11.9,29.8c20.7-9.9,39.8-22.6,56.9-37.6L397,419.6z M115,92.4 c13.9-12,29.4-22.3,46.1-30.4l-11.9-29.8c-20.7,9.9-39.8,22.6-56.8,37.6L115,92.4z M447.7,355.5c-7.8,14.9-17.2,28.8-28.1,41.5 l22.7,22.7c13.7-15.6,25.5-32.9,34.9-51.5L447.7,355.5z M471.4,272c-1.4,18.8-5.2,37-11.1,54.1l29.5,12.6 c7.5-21.1,12.2-43.5,13.6-66.8H471.4z M321.2,462c-15.7,5-32.2,8.2-49.2,9.4v32.1c21.2-1.4,41.7-5.4,61.1-11.7L321.2,462z M240,471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6,29.5c21.1,7.5,43.5,12.2,66.8,13.6V471.4z M462,190.8c5,15.7,8.2,32.2,9.4,49.2h32.1 c-1.4-21.2-5.4-41.7-11.7-61.1L462,190.8z M92.4,397c-12-13.9-22.3-29.4-30.4-46.1l-29.8,11.9c9.9,20.7,22.6,39.8,37.6,56.9 L92.4,397z M272,40.6c18.8,1.4,36.9,5.2,54.1,11.1l12.6-29.5C317.7,14.7,295.3,10,272,8.5V40.6z M190.8,50 c15.7-5,32.2-8.2,49.2-9.4V8.5c-21.2,1.4-41.7,5.4-61.1,11.7L190.8,50z M442.3,92.3L419.6,115c12,13.9,22.3,29.4,30.5,46.1 l29.8-11.9C470,128.5,457.3,109.4,442.3,92.3z M397,92.4l22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6,29.5 C370.4,72.1,384.4,81.5,397,92.4z`})});var i=I(I({},r),{},{attributeName:`opacity`}),a={tag:`circle`,attributes:I(I({},n),{},{cx:`256`,cy:`364`,r:`28`}),children:[]};return t||a.children.push({tag:`animate`,attributes:I(I({},r),{},{attributeName:`r`,values:`28;14;28;28;14;28;`})},{tag:`animate`,attributes:I(I({},i),{},{values:`1;0;1;1;0;1;`})}),e.push(a),e.push({tag:`path`,attributes:I(I({},n),{},{opacity:`1`,d:`M263.7,312h-16c-6.6,0-12-5.4-12-12c0-71,77.4-63.9,77.4-107.8c0-20-17.8-40.2-57.4-40.2c-29.1,0-44.3,9.6-59.2,28.7 c-3.9,5-11.1,6-16.2,2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2c21.2-27.2,46.4-44.7,91.2-44.7c52.3,0,97.4,29.8,97.4,80.2 c0,67.6-77.4,63.5-77.4,107.8C275.7,306.6,270.3,312,263.7,312z`}),children:t?[]:[{tag:`animate`,attributes:I(I({},i),{},{values:`1;0;0;0;0;1;`})}]}),t||e.push({tag:`path`,attributes:I(I({},n),{},{opacity:`0`,d:`M232.5,134.5l7,168c0.3,6.4,5.6,11.5,12,11.5h9c6.4,0,11.7-5.1,12-11.5l7-168c0.3-6.8-5.2-12.5-12-12.5h-23 C237.7,122,232.2,127.7,232.5,134.5z`}),children:[{tag:`animate`,attributes:I(I({},i),{},{values:`0;0;1;1;0;0;`})}]}),{tag:`g`,attributes:{class:`missing`},children:e}}}},{hooks:function(){return{parseNodeAttributes:function(e,t){var n=t.getAttribute(`data-fa-symbol`);return e.symbol=n===null?!1:n===``||n,e}}}}],{mixoutsTo:Z}),Z.noAuto;var Ao=Z.config;Z.library,Z.dom;var jo=Z.parse;Z.findIconDefinition,Z.toHtml;var Mo=Z.icon;Z.layer,Z.text,Z.counter;function No(e){return e-=0,e===e}function Po(e){return No(e)?e:(e=e.replace(/[_-]+(.)?/g,(e,t)=>t?t.toUpperCase():``),e.charAt(0).toLowerCase()+e.slice(1))}var Fo=(e,t)=>A.createElement(`stop`,{key:`${t}-${e.offset}`,offset:e.offset,stopColor:e.color,...e.opacity!==void 0&&{stopOpacity:e.opacity}});function Io(e){return e.charAt(0).toUpperCase()+e.slice(1)}var Lo=new Map,Ro=1e3;function zo(e){if(Lo.has(e))return Lo.get(e);let t={},n=0,r=e.length;for(;n<r;){let i=e.indexOf(`;`,n),a=i===-1?r:i,o=e.slice(n,a).trim();if(o){let e=o.indexOf(`:`);if(e>0){let n=o.slice(0,e).trim(),r=o.slice(e+1).trim();if(n&&r){let e=Po(n);t[e.startsWith(`webkit`)?Io(e):e]=r}}}n=a+1}if(Lo.size===Ro){let e=Lo.keys().next().value;e&&Lo.delete(e)}return Lo.set(e,t),t}function Bo(e,t,n={}){if(typeof t==`string`)return t;let r=(t.children||[]).map(t=>{let r=t;return(`fill`in n||n.gradientFill)&&t.tag===`path`&&`fill`in t.attributes&&(r={...t,attributes:{...t.attributes,fill:void 0}}),Bo(e,r)}),i=t.attributes||{},a={};for(let[e,t]of Object.entries(i))switch(!0){case e===`class`:a.className=t;break;case e===`style`:a.style=zo(String(t));break;case e.startsWith(`aria-`):case e.startsWith(`data-`):a[e.toLowerCase()]=t;break;default:a[Po(e)]=t}let{style:o,role:s,"aria-label":c,gradientFill:l,...u}=n;if(o&&(a.style=a.style?{...a.style,...o}:o),s&&(a.role=s),c&&(a[`aria-label`]=c,a[`aria-hidden`]=`false`),l){a.fill=`url(#${l.id})`;let{type:t,stops:n=[],...i}=l;r.unshift(e(t===`linear`?`linearGradient`:`radialGradient`,{...i,id:l.id},n.map(Fo)))}return e(t.tag,{...a,...u},...r)}var Vo=Bo.bind(null,A.createElement),Ho=(e,t)=>{let n=(0,A.useId)();return e||(t?n:void 0)},Uo=class{constructor(e=`react-fontawesome`){this.enabled=!1;let t=!1;try{t=typeof process<`u`&&!1}catch{}this.scope=e,this.enabled=t}log(...e){this.enabled&&console.log(`[${this.scope}]`,...e)}warn(...e){this.enabled&&console.warn(`[${this.scope}]`,...e)}error(...e){this.enabled&&console.error(`[${this.scope}]`,...e)}};typeof process<`u`&&{}.FA_VERSION;var Wo=`searchPseudoElementsFullScan`in Ao&&typeof Ao.searchPseudoElementsFullScan==`boolean`?`7.0.0`:`6.0.0`,Go=Number.parseInt(Wo)>=7,Ko=()=>Go,qo=`fa`,Q={beat:`fa-beat`,fade:`fa-fade`,beatFade:`fa-beat-fade`,bounce:`fa-bounce`,shake:`fa-shake`,spin:`fa-spin`,spinPulse:`fa-spin-pulse`,spinReverse:`fa-spin-reverse`,pulse:`fa-pulse`,flip360:`fa-flip-360`,buzz:`fa-buzz`,float:`fa-float`,jello:`fa-jello`,spinSnap:`fa-spin-snap`,spinSnap4:`fa-spin-snap-4`,spinSnap8:`fa-spin-snap-8`,swing:`fa-swing`,wag:`fa-wag`},Jo={left:`fa-pull-left`,right:`fa-pull-right`},Yo={90:`fa-rotate-90`,180:`fa-rotate-180`,270:`fa-rotate-270`},Xo={"2xs":`fa-2xs`,xs:`fa-xs`,sm:`fa-sm`,lg:`fa-lg`,xl:`fa-xl`,"2xl":`fa-2xl`,"1x":`fa-1x`,"2x":`fa-2x`,"3x":`fa-3x`,"4x":`fa-4x`,"5x":`fa-5x`,"6x":`fa-6x`,"7x":`fa-7x`,"8x":`fa-8x`,"9x":`fa-9x`,"10x":`fa-10x`},$={border:`fa-border`,fixedWidth:`fa-fw`,flip:`fa-flip`,flipHorizontal:`fa-flip-horizontal`,flipVertical:`fa-flip-vertical`,inverse:`fa-inverse`,rotateBy:`fa-rotate-by`,swapOpacity:`fa-swap-opacity`,widthAuto:`fa-width-auto`,canvasSquare:`fa-canvas-square`,canvasRoomy:`fa-canvas-roomy`},Zo={default:`fa-layers`};function Qo(e){let t=Ao.cssPrefix||Ao.familyPrefix||qo;return t===qo?e:e.replace(new RegExp(String.raw`(?<=^|\s)${qo}-`,`g`),`${t}-`)}function $o(e){let{beat:t,fade:n,beatFade:r,bounce:i,shake:a,spin:o,spinPulse:s,spinReverse:c,pulse:l,fixedWidth:u,inverse:d,border:f,flip:p,size:m,rotation:h,pull:g,swapOpacity:_,rotateBy:v,widthAuto:y,canvasSquare:b,canvasRoomy:ee,flip360:x,buzz:te,float:S,jello:ne,spinSnap:C,spinSnap4:re,spinSnap8:ie,swing:ae,wag:oe,className:se}=e,w=[];return se&&w.push(...se.split(` `)),t&&w.push(Q.beat),n&&w.push(Q.fade),r&&w.push(Q.beatFade),i&&w.push(Q.bounce),a&&w.push(Q.shake),o&&w.push(Q.spin),c&&w.push(Q.spinReverse),s&&w.push(Q.spinPulse),l&&w.push(Q.pulse),u&&w.push($.fixedWidth),d&&w.push($.inverse),f&&w.push($.border),p===!0&&w.push($.flip),(p===`horizontal`||p===`both`)&&w.push($.flipHorizontal),(p===`vertical`||p===`both`)&&w.push($.flipVertical),m!=null&&w.push(Xo[m]),h!=null&&h!==0&&w.push(Yo[h]),g!=null&&w.push(Jo[g]),_&&w.push($.swapOpacity),Ko()?(v&&w.push($.rotateBy),y&&w.push($.widthAuto),b&&w.push($.canvasSquare),ee&&w.push($.canvasRoomy),x&&w.push(Q.flip360),te&&w.push(Q.buzz),S&&w.push(Q.float),ne&&w.push(Q.jello),C&&w.push(Q.spinSnap),re&&w.push(Q.spinSnap4),ie&&w.push(Q.spinSnap8),ae&&w.push(Q.swing),oe&&w.push(Q.wag),(Ao.cssPrefix||Ao.familyPrefix||qo)===qo?w:w.map(Qo)):w}var es=e=>typeof e==`object`&&`icon`in e&&!!e.icon;function ts(e){if(e)return es(e)?e:jo.icon(e)}function ns(e){return Object.keys(e)}var rs=new Uo(`FontAwesomeIcon`),is={border:!1,className:``,mask:void 0,maskId:void 0,fixedWidth:!1,inverse:!1,flip:!1,icon:void 0,listItem:!1,pull:void 0,pulse:!1,rotation:void 0,rotateBy:!1,size:void 0,spin:!1,spinPulse:!1,spinReverse:!1,beat:!1,fade:!1,beatFade:!1,bounce:!1,shake:!1,symbol:!1,title:``,titleId:void 0,transform:void 0,swapOpacity:!1,widthAuto:!1,canvasSquare:!1,canvasRoomy:!1,flip360:!1,buzz:!1,float:!1,jello:!1,spinSnap:!1,spinSnap4:!1,spinSnap8:!1,swing:!1,wag:!1},as=new Set(Object.keys(is)),os=A.forwardRef((e,t)=>{let n={...is,...e},{icon:r,mask:i,symbol:a,title:o,titleId:s,maskId:c,transform:l}=n,u=Ho(c,!!i),d=Ho(s,!!o),f=ts(r);if(!f)return rs.error(`Icon lookup is undefined`,r),null;let p=$o(n),m=typeof l==`string`?jo.transform(l):l,h=ts(i),g=Mo(f,{...p.length>0&&{classes:p},...m&&{transform:m},...h&&{mask:h},symbol:a,title:o,titleId:d,maskId:u});if(!g)return rs.error(`Could not find icon`,f),null;let{abstract:_}=g,v={ref:t};for(let e of ns(n))as.has(e)||(v[e]=n[e]);return Vo(_[0],v)});os.displayName=`FontAwesomeIcon`,`${Zo.default}${$.fixedWidth}`;var ss={prefix:`fas`,iconName:`bell`,icon:[448,512,[128276,61602],`f0f3`,`M224 0c-17.7 0-32 14.3-32 32l0 3.2C119 50 64 114.6 64 192l0 21.7c0 48.1-16.4 94.8-46.4 132.4L7.8 358.3C2.7 364.6 0 372.4 0 380.5 0 400.1 15.9 416 35.5 416l376.9 0c19.6 0 35.5-15.9 35.5-35.5 0-8.1-2.7-15.9-7.8-22.2l-9.8-12.2C400.4 308.5 384 261.8 384 213.7l0-21.7c0-77.4-55-142-128-156.8l0-3.2c0-17.7-14.3-32-32-32zM162 464c7.1 27.6 32.2 48 62 48s54.9-20.4 62-48l-124 0z`]},cs={prefix:`fas`,iconName:`map-location-dot`,icon:[640,512,[`map-marked-alt`],`f5a0`,`M576 48c0-11.1-5.7-21.4-15.2-27.2s-21.2-6.4-31.1-1.4L413.5 77.5 234.1 17.6c-8.1-2.7-16.8-2.1-24.4 1.7l-128 64C70.8 88.8 64 99.9 64 112l0 352c0 11.1 5.7 21.4 15.2 27.2s21.2 6.4 31.1 1.4l116.1-58.1 173.3 57.8c-4.3-6.4-8.5-13.1-12.6-19.9-11-18.3-21.9-39.3-30-61.8l-101.2-33.7 0-284.5 128 42.7 0 99.3c31-35.8 77-58.4 128-58.4 22.6 0 44.2 4.4 64 12.5L576 48zM512 224c-66.3 0-120 52.8-120 117.9 0 68.9 64.1 150.4 98.6 189.3 11.6 13 31.3 13 42.9 0 34.5-38.9 98.6-120.4 98.6-189.3 0-65.1-53.7-117.9-120-117.9zM472 344a40 40 0 1 1 80 0 40 40 0 1 1 -80 0z`]},ls={prefix:`fas`,iconName:`chart-line`,icon:[512,512,[`line-chart`],`f201`,`M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7 262.6 153.4c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l73.4-73.4 57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z`]},us={prefix:`fas`,iconName:`server`,icon:[448,512,[],`f233`,`M64 32C28.7 32 0 60.7 0 96l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64c0-35.3-28.7-64-64-64L64 32zm216 72a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm56 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zM64 288c-35.3 0-64 28.7-64 64l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64c0-35.3-28.7-64-64-64L64 288zm216 72a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm56 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z`]},ds={prefix:`fas`,iconName:`circle-nodes`,icon:[512,512,[],`e4e2`,`M418.4 157.9c35.3-8.3 61.6-40 61.6-77.9 0-44.2-35.8-80-80-80-43.4 0-78.7 34.5-80 77.5L136.2 151.1C121.7 136.8 101.9 128 80 128 35.8 128 0 163.8 0 208s35.8 80 80 80c12.2 0 23.8-2.7 34.1-7.6L259.7 407.8c-2.4 7.6-3.7 15.8-3.7 24.2 0 44.2 35.8 80 80 80s80-35.8 80-80c0-27.7-14-52.1-35.4-66.4l37.8-207.7zM156.3 232.2c2.2-6.9 3.5-14.2 3.7-21.7l183.8-73.5c3.6 3.5 7.4 6.7 11.6 9.5L317.6 354.1c-5.5 1.3-10.8 3.1-15.8 5.5L156.3 232.2z`]},fs={prefix:`fas`,iconName:`shield-halved`,icon:[512,512,[`shield-alt`],`f3ed`,`M256 0c4.6 0 9.2 1 13.4 2.9L457.8 82.8c22 9.3 38.4 31 38.3 57.2-.5 99.2-41.3 280.7-213.6 363.2-16.7 8-36.1 8-52.8 0-172.4-82.5-213.1-264-213.6-363.2-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.9 1 251.4 0 256 0zm0 66.8l0 378.1c138-66.8 175.1-214.8 176-303.4l-176-74.6 0 0z`]},ps={prefix:`fas`,iconName:`tower-broadcast`,icon:[576,512,[`broadcast-tower`],`f519`,`M87.9 11.5c-11.3-6.9-26.1-3.2-33 8.1-24.8 41-39 89.1-39 140.4s14.2 99.4 39 140.4c6.9 11.3 21.6 15 33 8.1s15-21.6 8.1-33C75.7 241.9 64 202.3 64 160S75.7 78.1 96.1 44.4c6.9-11.3 3.2-26.1-8.1-33zm400.1 0c-11.3 6.9-15 21.6-8.1 33 20.4 33.7 32.1 73.3 32.1 115.6s-11.7 81.9-32.1 115.6c-6.9 11.3-3.2 26.1 8.1 33s26.1 3.2 33-8.1c24.8-41 39-89.1 39-140.4S545.8 60.6 521 19.6c-6.9-11.3-21.6-15-33-8.1zM320 215.4c19.1-11.1 32-31.7 32-55.4 0-35.3-28.7-64-64-64s-64 28.7-64 64c0 23.7 12.9 44.4 32 55.4L256 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-264.6zM180.2 91c7.2-11.2 3.9-26-7.2-33.2s-26-3.9-33.2 7.2c-17.6 27.4-27.8 60-27.8 95s10.2 67.6 27.8 95c7.2 11.2 22 14.4 33.2 7.2s14.4-22 7.2-33.2c-12.8-19.9-20.2-43.6-20.2-69s7.4-49.1 20.2-69zM436.2 65c-7.2-11.2-22-14.4-33.2-7.2s-14.4 22-7.2 33.2c12.8 19.9 20.2 43.6 20.2 69s-7.4 49.1-20.2 69c-7.2 11.2-3.9 26 7.2 33.2s26 3.9 33.2-7.2c17.6-27.4 27.8-60 27.8-95s-10.2-67.6-27.8-95z`]},ms={prefix:`fas`,iconName:`robot`,icon:[640,512,[129302],`f544`,`M352 0c0-17.7-14.3-32-32-32S288-17.7 288 0l0 64-96 0c-53 0-96 43-96 96l0 224c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-224c0-53-43-96-96-96l-96 0 0-64zM160 368c0-13.3 10.7-24 24-24l32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0c-13.3 0-24-10.7-24-24zm120 0c0-13.3 10.7-24 24-24l32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0c-13.3 0-24-10.7-24-24zm120 0c0-13.3 10.7-24 24-24l32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0c-13.3 0-24-10.7-24-24zM224 176a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm144 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM64 224c0-17.7-14.3-32-32-32S0 206.3 0 224l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96zm544-32c-17.7 0-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96c0-17.7-14.3-32-32-32z`]},hs={prefix:`fas`,iconName:`bolt`,icon:[448,512,[9889,`zap`],`f0e7`,`M338.8-9.9c11.9 8.6 16.3 24.2 10.9 37.8L271.3 224 416 224c13.5 0 25.5 8.4 30.1 21.1s.7 26.9-9.6 35.5l-288 240c-11.3 9.4-27.4 9.9-39.3 1.3s-16.3-24.2-10.9-37.8L176.7 288 32 288c-13.5 0-25.5-8.4-30.1-21.1s-.7-26.9 9.6-35.5l288-240c11.3-9.4 27.4-9.9 39.3-1.3z`]},gs={prefix:`fas`,iconName:`wifi`,icon:[576,512,[`wifi-3`,`wifi-strong`],`f1eb`,`M288 96c-90.9 0-173.2 36-233.7 94.6-12.7 12.3-33 12-45.2-.7s-12-33 .7-45.2C81.7 74.9 179.9 32 288 32S494.3 74.9 566.3 144.7c12.7 12.3 13 32.6 .7 45.2s-32.6 13-45.2 .7C461.2 132 378.9 96 288 96zM240 432a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM168 326.2c-11.7 13.3-31.9 14.5-45.2 2.8s-14.5-31.9-2.8-45.2C161 237.4 221.1 208 288 208s127 29.4 168 75.8c11.7 13.3 10.4 33.5-2.8 45.2s-33.5 10.4-45.2-2.8C378.6 292.9 335.8 272 288 272s-90.6 20.9-120 54.2z`]},_s={prefix:`fas`,iconName:`route`,icon:[512,512,[],`f4d7`,`M512 96c0 50.2-59.1 125.1-84.6 155-3.8 4.4-9.4 6.1-14.5 5L320 256c-17.7 0-32 14.3-32 32s14.3 32 32 32l96 0c53 0 96 43 96 96s-43 96-96 96l-276.4 0c8.7-9.9 19.3-22.6 30-36.8 6.3-8.4 12.8-17.6 19-27.2L416 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0c-53 0-96-43-96-96s43-96 96-96l39.8 0c-21-31.5-39.8-67.7-39.8-96 0-53 43-96 96-96s96 43 96 96zM117.1 489.1c-3.8 4.3-7.2 8.1-10.1 11.3l-1.8 2-.2-.2c-6 4.6-14.6 4-20-1.8-25.2-27.4-85-97.9-85-148.4 0-53 43-96 96-96s96 43 96 96c0 30-21.1 67-43.5 97.9-10.7 14.7-21.7 28-30.8 38.5l-.6 .7zM128 352a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM416 128a32 32 0 1 0 0-64 32 32 0 1 0 0 64z`]},vs={prefix:`fas`,iconName:`layer-group`,icon:[512,512,[],`f5fd`,`M232.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L13.9 149.8C5.4 145.8 0 137.3 0 128s5.4-17.9 13.9-21.8L232.5 5.2zM48.1 218.4l164.3 75.9c27.7 12.8 59.6 12.8 87.3 0l164.3-75.9 34.1 15.8c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L13.9 277.8C5.4 273.8 0 265.3 0 256s5.4-17.9 13.9-21.8l34.1-15.8zM13.9 362.2l34.1-15.8 164.3 75.9c27.7 12.8 59.6 12.8 87.3 0l164.3-75.9 34.1 15.8c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L13.9 405.8C5.4 401.8 0 393.3 0 384s5.4-17.9 13.9-21.8z`]},ys=[{icon:hs,title:`Real-time Monitoring`,desc:`Status ONU, RX power, traffic — live update`},{icon:ps,title:`ZTE OLT Support`,desc:`ZTE C320, C300, C600, C650 — SNMP + SSH/Telnet`},{icon:us,title:`OLT Provisioning`,desc:`Register, configure, manage ONUs via CLI/SNMP`},{icon:fs,title:`Secure & Isolated`,desc:`Multi-tenant dengan isolasi data per subdomain`}],bs=[{icon:gs,label:`ONU Monitoring`},{icon:hs,label:`Auto Provisioning`},{icon:cs,label:`FTTH Map`},{icon:ls,label:`Traffic Graphs`},{icon:ds,label:`PON Topology`},{icon:vs,label:`ODP / ODC / OTB`},{icon:ss,label:`Smart Alerts`},{icon:ms,label:`WhatsApp Bot`},{icon:_s,label:`Fiber Path Trace`},{icon:fs,label:`Role Permissions`}];function xs(e){return{"--d":`${e}ms`}}function Ss({children:e,brandName:t,logoUrl:n}){return(0,j.jsxs)(`div`,{className:`min-h-screen flex bg-[var(--bg-primary)] text-tx1`,children:[(0,j.jsxs)(`div`,{className:`hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12`,children:[(0,j.jsx)(`div`,{className:`absolute inset-0 bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-primary)] to-[var(--bg-primary)]`}),(0,j.jsx)(`div`,{className:`absolute inset-0 auth-dot-grid opacity-60`,style:{maskImage:`radial-gradient(ellipse 90% 70% at 30% 40%, black 30%, transparent 85%)`,WebkitMaskImage:`radial-gradient(ellipse 90% 70% at 30% 40%, black 30%, transparent 85%)`}}),(0,j.jsx)(`div`,{className:`absolute top-1/4 left-1/4 w-96 h-96 bg-accent/8 rounded-full blur-3xl auth-blob`}),(0,j.jsx)(`div`,{className:`absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-500/6 rounded-full blur-3xl auth-blob-slow`}),(0,j.jsx)(`div`,{className:`absolute top-1/2 right-0 w-64 h-64 bg-success/6 rounded-full blur-3xl auth-blob`}),(0,j.jsx)(`div`,{className:`relative z-10 stagger-in`,style:xs(0),children:(0,j.jsxs)(`div`,{className:`flex items-center gap-3`,children:[(0,j.jsxs)(`div`,{className:`relative flex-shrink-0`,children:[!n&&(0,j.jsxs)(j.Fragment,{children:[(0,j.jsx)(`span`,{className:`signal-ring`,style:{animationDelay:`0s`}}),(0,j.jsx)(`span`,{className:`signal-ring`,style:{animationDelay:`1.1s`}})]}),(0,j.jsx)(`div`,{className:k(`relative w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden`,n?`bg-white p-1.5`:`bg-accent/15 glow-accent`),children:n?(0,j.jsx)(`img`,{src:n,alt:t,className:`w-full h-full object-contain`}):(0,j.jsx)(os,{icon:ps,className:`text-accent`,style:{fontSize:22}})})]}),(0,j.jsxs)(`div`,{children:[(0,j.jsx)(`h1`,{className:`text-xl font-bold font-display tracking-tight`,children:t}),(0,j.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:`Network Management System`})]})]})}),(0,j.jsxs)(`div`,{className:`relative z-10 flex-1 flex flex-col justify-center max-w-md`,children:[(0,j.jsxs)(`h2`,{className:`text-3xl xl:text-4xl font-bold font-display leading-tight mb-4 stagger-in`,style:xs(80),children:[`Kelola Jaringan FTTH`,(0,j.jsx)(`br`,{}),(0,j.jsx)(`span`,{className:`text-accent`,children:`dari Satu Dashboard`})]}),(0,j.jsx)(`p`,{className:`text-sm text-tx2 leading-relaxed mb-8 stagger-in`,style:xs(160),children:`Monitoring OLT & ONU real-time, provisioning otomatis, manajemen ZTE OLT — semua dalam satu platform terintegrasi.`}),(0,j.jsx)(`div`,{className:`space-y-3`,children:ys.map((e,t)=>(0,j.jsxs)(`div`,{className:`flex items-start gap-3 group stagger-in`,style:xs(240+t*90),children:[(0,j.jsx)(`div`,{className:`icon-badge w-10 h-10 flex-shrink-0 group-hover:scale-105`,children:(0,j.jsx)(os,{icon:e.icon,style:{fontSize:16}})}),(0,j.jsxs)(`div`,{className:`pt-1.5`,children:[(0,j.jsx)(`p`,{className:`text-sm font-medium text-tx1`,children:e.title}),(0,j.jsx)(`p`,{className:`text-xs text-tx3 mt-0.5`,children:e.desc})]})]},e.title))})]}),(0,j.jsxs)(`div`,{className:`relative z-10 space-y-4 stagger-in`,style:xs(620),children:[(0,j.jsx)(`div`,{className:`auth-marquee`,children:(0,j.jsx)(`div`,{className:`auth-marquee-track`,children:[...bs,...bs].map((e,t)=>(0,j.jsxs)(`span`,{className:`auth-marquee-item`,children:[(0,j.jsx)(os,{icon:e.icon,className:`text-accent`,style:{fontSize:11}}),e.label]},t))})}),(0,j.jsxs)(`div`,{className:`flex items-center gap-6`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,j.jsx)(`div`,{className:`w-2 h-2 rounded-full bg-success animate-pulse`}),(0,j.jsx)(`span`,{className:`text-xs text-tx3`,children:`System Operational`})]}),(0,j.jsx)(`div`,{className:`h-4 w-px bg-brd`}),(0,j.jsxs)(`div`,{className:`flex items-center gap-2 text-xs text-tx3`,children:[(0,j.jsx)(x,{size:14,className:`text-accent`}),(0,j.jsx)(`span`,{children:`FTTH Ready`})]})]})]})]}),(0,j.jsxs)(`div`,{className:`w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-y-auto`,children:[(0,j.jsxs)(`div`,{className:`fixed inset-0 overflow-hidden pointer-events-none lg:hidden`,children:[(0,j.jsx)(`div`,{className:`absolute inset-0 auth-dot-grid opacity-40`}),(0,j.jsx)(`div`,{className:`absolute top-1/4 left-1/4 w-72 h-72 bg-accent/5 rounded-full blur-3xl auth-blob`}),(0,j.jsx)(`div`,{className:`absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/5 rounded-full blur-3xl auth-blob-slow`})]}),(0,j.jsxs)(`div`,{className:`lg:hidden fixed top-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2`,children:[(0,j.jsx)(`div`,{className:k(`w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden`,n?`bg-white p-1.5`:`bg-accent/15 glow-accent`),children:n?(0,j.jsx)(`img`,{src:n,alt:t,className:`w-full h-full object-contain`}):(0,j.jsx)(os,{icon:ps,className:`text-accent`,style:{fontSize:20}})}),(0,j.jsx)(`h1`,{className:`text-lg font-bold font-display`,children:t})]}),(0,j.jsx)(`div`,{className:`relative w-full max-w-md stagger-in mt-20 lg:mt-0`,style:xs(80),children:e})]})]})}var Cs=e(ge(),1),ws={sm:`max-w-md`,md:`max-w-lg`,lg:`max-w-2xl`,xl:`max-w-4xl`};function Ts({open:e,onClose:t,title:n,icon:r,children:i,size:a=`md`,footer:o}){return(0,A.useEffect)(()=>{if(!e)return;let n=e=>{e.key===`Escape`&&t()};return document.addEventListener(`keydown`,n),()=>document.removeEventListener(`keydown`,n)},[e,t]),e?(0,Cs.createPortal)((0,j.jsxs)(j.Fragment,{children:[(0,j.jsx)(`div`,{className:`modal-overlay`,onClick:t}),(0,j.jsx)(`div`,{className:`modal-wrapper`,children:(0,j.jsxs)(`div`,{className:k(`relative glass-card w-full flex flex-col rounded-t-2xl md:rounded-2xl`,`max-h-[90dvh] md:max-h-[85dvh] animate-slide-up md:animate-fade-in`,ws[a]),onClick:e=>e.stopPropagation(),children:[n&&(0,j.jsxs)(`div`,{className:`section-header sticky top-0 z-10 rounded-t-2xl`,children:[(0,j.jsxs)(`h2`,{className:`section-title`,children:[r,n]}),(0,j.jsx)(`button`,{onClick:t,className:`text-tx3 hover:text-tx1 transition-colors p-1 rounded-lg hover:bg-glass`,children:(0,j.jsx)(C,{size:18})})]}),(0,j.jsx)(`div`,{className:`overflow-y-auto flex-1 p-4 md:p-5`,children:i}),o&&(0,j.jsx)(`div`,{className:`modal-footer justify-end`,children:o})]})})]}),document.body):null}function Es({title:e,icon:t,action:n,children:r,className:i,bodyClassName:a,onClick:o}){return(0,j.jsxs)(`div`,{className:k(`glass-card`,i),onClick:o,role:o?`button`:void 0,tabIndex:o?0:void 0,onKeyDown:o?e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),o())}:void 0,children:[e&&(0,j.jsxs)(`div`,{className:`section-header`,children:[(0,j.jsxs)(`h3`,{className:`section-title`,children:[t,e]}),n]}),(0,j.jsx)(`div`,{className:k(`p-4 md:p-5`,a),children:r})]})}function Ds({size:e=`md`,className:t}){return(0,j.jsx)(`div`,{className:k(`spinner`,e===`lg`&&`spinner-lg`,e===`sm`&&`spinner-sm`,t)})}function Os({label:e}){return(0,j.jsxs)(`div`,{className:`flex flex-col items-center justify-center py-12`,children:[(0,j.jsx)(_,{size:28,className:`text-accent animate-spin`}),e&&(0,j.jsx)(`p`,{className:`text-tx3 text-sm mt-3`,children:e})]})}function ks({icon:e,title:t,description:n,action:r}){return(0,j.jsxs)(`div`,{className:`empty-state`,children:[e&&(0,j.jsx)(`div`,{className:`empty-state-icon`,children:(0,j.jsx)(e,{size:22})}),(0,j.jsx)(`p`,{className:`empty-state-title`,children:t}),n&&(0,j.jsx)(`p`,{className:`empty-state-desc`,children:n}),r&&(0,j.jsx)(`div`,{className:`mt-4`,children:r})]})}function As({children:e,className:t,maxHeight:n=`max-h-64`}){return(0,j.jsx)(`div`,{className:k(`code-block`,n,`overflow-y-auto`,t),children:(0,j.jsx)(`pre`,{children:e})})}function js({tabs:e,active:t,onChange:n,className:r}){return(0,j.jsx)(`div`,{className:k(`flex gap-1 p-1 rounded-xl bg-glass border border-brd w-fit overflow-x-auto tab-scroll`,r),children:e.map(e=>(0,j.jsxs)(`button`,{onClick:()=>n(e.key),className:k(`tab-btn inline-flex items-center gap-1.5`,t===e.key&&`tab-btn-active`),children:[e.icon,e.label]},e.key))})}function Ms({className:e}){return(0,j.jsx)(`div`,{className:k(`animate-pulse rounded-lg bg-glass`,e)})}var Ns={primary:`btn-primary`,secondary:`btn-cancel border border-brd`,ghost:`btn-ghost`,danger:`btn-danger`,warning:`btn-warning`,accent:`btn-accent`,icon:`p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass transition-colors active:scale-95`},Ps=(0,A.forwardRef)(function({variant:e=`primary`,loading:t=!1,icon:n,disabled:r,className:i,children:a,type:o=`button`,...s},c){return(0,j.jsxs)(`button`,{ref:c,type:o,disabled:r||t,"aria-busy":t||void 0,className:k(Ns[e],`inline-flex items-center justify-center gap-2`,i),...s,children:[t?(0,j.jsx)(Ds,{size:`sm`}):n,a]})}),Fs=(0,A.forwardRef)(function({label:e,error:t,helperText:n,icon:r,suffix:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,A.useId)(),d=s||u;return(0,j.jsxs)(`div`,{className:k(`w-full`,o),children:[e&&(0,j.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,j.jsxs)(`div`,{className:`relative`,children:[r&&(0,j.jsx)(`span`,{className:`absolute left-3 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none`,children:r}),(0,j.jsx)(`input`,{ref:l,id:d,className:k(`input-field`,r&&`pl-9`,i&&`pr-10`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c}),i&&(0,j.jsx)(`span`,{className:`absolute right-3 top-1/2 -translate-y-1/2 text-tx3`,children:i})]}),t?(0,j.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,j.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})}),Is=(0,A.forwardRef)(function({label:e,error:t,helperText:n,options:r,children:i,className:a,wrapperClassName:o,id:s,...c},l){let u=(0,A.useId)(),d=s||u;return(0,j.jsxs)(`div`,{className:k(`w-full`,o),children:[e&&(0,j.jsx)(`label`,{htmlFor:d,className:`label-sm block`,children:e}),(0,j.jsx)(`select`,{ref:l,id:d,className:k(`input-field`,t&&`border-danger`,a),"aria-invalid":!!t||void 0,"aria-describedby":t?`${d}-error`:n?`${d}-helper`:void 0,...c,children:r?r.map(e=>(0,j.jsx)(`option`,{value:e.value,disabled:e.disabled,children:e.label},e.value)):i}),t?(0,j.jsx)(`p`,{id:`${d}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,j.jsx)(`p`,{id:`${d}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})});(0,A.forwardRef)(function({label:e,error:t,helperText:n,className:r,wrapperClassName:i,id:a,...o},s){let c=(0,A.useId)(),l=a||c;return(0,j.jsxs)(`div`,{className:k(`w-full`,i),children:[e&&(0,j.jsx)(`label`,{htmlFor:l,className:`label-sm block`,children:e}),(0,j.jsx)(`textarea`,{ref:s,id:l,className:k(`input-field`,`h-auto min-h-[80px] py-2.5`,t&&`border-danger`,r),"aria-invalid":!!t||void 0,"aria-describedby":t?`${l}-error`:n?`${l}-helper`:void 0,...o}),t?(0,j.jsx)(`p`,{id:`${l}-error`,className:`text-xs text-danger mt-1`,children:t}):n?(0,j.jsx)(`p`,{id:`${l}-helper`,className:`text-xs text-tx3 mt-1`,children:n}):null]})});function Ls(){let[e,t]=(0,A.useState)(``),[n,r]=(0,A.useState)(``),[i,a]=(0,A.useState)(!1),[o,l]=(0,A.useState)(!1),[u,d]=(0,A.useState)(!1),{login:f,user:p,loading:m}=P(),h=he(),[g,_]=(0,A.useState)(``),[y,b]=(0,A.useState)(null),[ee,x]=(0,A.useState)(!1),[te,S]=(0,A.useState)(``),[ne,C]=(0,A.useState)(!1),[ie,ae]=(0,A.useState)(!1),oe=window.location.hostname===`nms.salfa.my.id`||window.location.hostname===`localhost`||window.location.hostname===`127.0.0.1`;return(0,A.useEffect)(()=>{fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{_(e.nms_name||`FiberNMS`),b(e.logo_url||null)}).catch(()=>{_(`FiberNMS`)})},[]),m?null:p?(0,j.jsx)(me,{to:`/dashboard`,replace:!0}):(0,j.jsxs)(Ss,{brandName:g,logoUrl:y,children:[(0,j.jsxs)(Es,{bodyClassName:`p-6 sm:p-8`,children:[(0,j.jsx)(`h2`,{className:`text-xl font-semibold mb-1 font-display`,children:`Sign In`}),(0,j.jsx)(`p`,{className:`text-xs text-tx3 mb-6`,children:`Masuk ke dashboard monitoring Anda`}),(0,j.jsxs)(`form`,{onSubmit:async t=>{if(t.preventDefault(),l(!0),await f(e,n)){l(!1),d(!0),M.success(`Welcome back!`);let e=P.getState().user;await new Promise(e=>setTimeout(e,550)),e?.is_super_admin?h(`/dashboard/admin`):h(`/dashboard`)}else M.error(P.getState().error||`Invalid username or password`),l(!1)},className:`space-y-5`,children:[(0,j.jsx)(Fs,{label:`Username`,type:`text`,value:e,onChange:e=>t(e.target.value),placeholder:`Enter your username`,className:`h-11`,autoFocus:!0,required:!0}),(0,j.jsx)(Fs,{label:`Password`,type:i?`text`:`password`,value:n,onChange:e=>r(e.target.value),placeholder:`Enter your password`,className:`h-11`,required:!0,suffix:(0,j.jsx)(`button`,{type:`button`,onClick:()=>a(!i),className:`hover:text-tx2 transition-colors`,children:i?(0,j.jsx)(c,{size:18}):(0,j.jsx)(s,{size:18})})}),(0,j.jsx)(Ps,{type:`submit`,variant:`primary`,loading:o,disabled:o||u,className:k(`w-full h-11 glow-accent transition-colors duration-300`,u&&`cursor-default`),style:u?{background:`var(--color-success)`}:void 0,children:u?(0,j.jsxs)(`span`,{className:`inline-flex items-center gap-1.5 animate-check-pop`,children:[(0,j.jsx)(re,{size:18,strokeWidth:3}),`Berhasil masuk`]}):o?`Signing in...`:`Sign In`})]}),!oe&&!ee&&(0,j.jsx)(`div`,{className:`text-center mt-4`,children:(0,j.jsxs)(`button`,{type:`button`,onClick:()=>{x(!0)},className:`text-sm text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1.5`,children:[(0,j.jsx)(de,{size:14}),`Lupa Password?`]})}),(0,j.jsx)(`p`,{className:`text-center text-xs text-tx3 mt-6`,children:`Secure connection • Credentials encrypted`})]}),ee&&(0,j.jsxs)(Es,{className:`mt-4`,bodyClassName:`p-6 sm:p-8`,children:[(0,j.jsxs)(`div`,{className:`flex items-center gap-3 mb-6`,children:[(0,j.jsx)(`button`,{type:`button`,onClick:()=>{x(!1),ae(!1),S(``)},className:`text-tx3 hover:text-tx2 transition-colors`,children:(0,j.jsx)(v,{size:20})}),(0,j.jsx)(`h2`,{className:`text-xl font-semibold font-display`,children:`Reset Password`})]}),ie?(0,j.jsxs)(`div`,{className:`text-center py-4`,children:[(0,j.jsx)(`div`,{className:`w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4`,children:(0,j.jsxs)(`svg`,{width:`28`,height:`28`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,className:`text-success`,children:[(0,j.jsx)(`path`,{d:`M22 11.08V12a10 10 0 11-5.93-9.14`}),(0,j.jsx)(`polyline`,{points:`22 4 12 14.01 9 11.01`})]})}),(0,j.jsx)(`p`,{className:`text-sm text-tx2 mb-2`,children:`Password baru telah dikirim via WhatsApp!`}),(0,j.jsx)(`p`,{className:`text-xs text-tx3`,children:`Cek WhatsApp nomor terdaftar tenant Anda untuk password baru. Silakan login dengan password tersebut.`}),(0,j.jsx)(Ps,{type:`button`,variant:`primary`,className:`mt-6`,onClick:()=>{x(!1),ae(!1),S(``)},children:`Kembali ke Login`})]}):(0,j.jsxs)(j.Fragment,{children:[(0,j.jsx)(`p`,{className:`text-sm text-tx3 mb-5`,children:`Masukkan username Anda. Password baru akan dikirim langsung via WhatsApp ke nomor terdaftar tenant.`}),(0,j.jsxs)(`form`,{onSubmit:async e=>{e.preventDefault(),C(!0);try{let e=await(await fetch(`/api/public/forgot-password`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({identifier:te})})).json();e.success?(ae(!0),M.success(`Reset request sent!`)):M.error(e.message||`Failed to send request`)}catch{M.error(`Network error. Please try again.`)}C(!1)},className:`space-y-5`,children:[(0,j.jsx)(Fs,{label:`Username`,type:`text`,value:te,onChange:e=>S(e.target.value),placeholder:`Masukkan username Anda`,className:`h-11`,autoFocus:!0,required:!0}),(0,j.jsx)(Ps,{type:`submit`,variant:`primary`,loading:ne,className:`w-full h-11 glow-accent`,children:ne?`Mengirim...`:`Kirim Permintaan Reset`})]})]})]})]})}var Rs=(0,A.lazy)(()=>T(()=>import(`./Dashboard-YPn4fsC1.js`).then(e=>({default:e.Dashboard})),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10]))),zs=(0,A.lazy)(()=>T(()=>import(`./AllOnus-DeIm32FN.js`).then(e=>({default:e.AllOnus})),__vite__mapDeps([11,1,2,3,4,5,6,7,8,9,12,10,13]))),Bs=(0,A.lazy)(()=>T(()=>import(`./ViewOnu-TlCw7mP1.js`).then(e=>({default:e.ViewOnu})),__vite__mapDeps([14,1,2,3,4,5,8,10,15,16]))),Vs=(0,A.lazy)(()=>T(()=>import(`./AddOnu-B-Hf2Eea.js`).then(e=>({default:e.AddOnu})),__vite__mapDeps([17,1,2,3,4,5,6,7,8]))),Hs=(0,A.lazy)(()=>T(()=>import(`./OltSettings-CzPMsecM.js`).then(e=>({default:e.OltSettings})),__vite__mapDeps([18,1,2,3,4,5,6,7,8,10]))),Us=(0,A.lazy)(()=>T(()=>import(`./UserManagement-BeNATzK5.js`).then(e=>({default:e.UserManagement})),__vite__mapDeps([19,1,2,4,6,5,7,8,3,10]))),Ws=(0,A.lazy)(()=>T(()=>import(`./Customization-BSu17ayo.js`).then(e=>({default:e.Customization})),__vite__mapDeps([20,1,2,3,4,5,6,7,8]))),Gs=(0,A.lazy)(()=>T(()=>import(`./RegisterWizard-B1-OEsKc.js`).then(e=>({default:e.RegisterWizard})),__vite__mapDeps([21,1,2,3,4,5,12]))),Ks=(0,A.lazy)(()=>T(()=>import(`./ProvisionWizard-CgVDkpyh.js`).then(e=>({default:e.ProvisionWizard})),__vite__mapDeps([22,1,2,3,4,5,6,7,8,12]))),qs=(0,A.lazy)(()=>T(()=>import(`./OltConfiguration-CQoOUqou.js`).then(e=>({default:e.OltConfiguration})),__vite__mapDeps([23,1,2,3,4,5,8,10,15]))),Js=(0,A.lazy)(()=>T(()=>import(`./MyProfile-DHcEFzmL.js`).then(e=>({default:e.MyProfile})),__vite__mapDeps([24,1,2,4,6,5,7,8,3]))),Ys=(0,A.lazy)(()=>T(()=>import(`./AlertSettings-cumBXBgP.js`).then(e=>({default:e.AlertSettings})),__vite__mapDeps([25,1,2,4,5,7,8,3]))),Xs=(0,A.lazy)(()=>T(()=>import(`./FtthInfrastructure-DZE91Nyt.js`).then(e=>({default:e.FtthInfrastructure})),__vite__mapDeps([26,1,2,3,4,5,6,7,8,10,13]))),Zs=(0,A.lazy)(()=>T(()=>import(`./Templates-D1BYbQhq.js`).then(e=>({default:e.default})),__vite__mapDeps([27,1,2,3,4,5,6,7,8]))),Qs=(0,A.lazy)(()=>T(()=>import(`./Tr069Profile-DnTR3THI.js`).then(e=>({default:e.default})),__vite__mapDeps([28,1,2,4,6,5,7,8,3,10]))),$s=(0,A.lazy)(()=>T(()=>import(`./ActionLogs-Bfia17Pm.js`).then(e=>({default:e.ActionLogs})),__vite__mapDeps([29,1,2,4,5,6,7,8,3,9]))),ec=(0,A.lazy)(()=>T(()=>import(`./AlertHistory-CK5l9n09.js`).then(e=>({default:e.AlertHistory})),__vite__mapDeps([30,1,2,4,5,6,7,8,3,9]))),tc=(0,A.lazy)(()=>T(()=>import(`./Traffic-D_rmhVx7.js`).then(e=>({default:e.Traffic})),__vite__mapDeps([31,1,2,4,5,6,7,8,3,9,15,16]))),nc=(0,A.lazy)(()=>T(()=>import(`./CloudflareTunnel-NkLQYoDJ.js`).then(e=>({default:e.CloudflareTunnel})),__vite__mapDeps([32,1,2,4,6,5,7,8,3]))),rc=(0,A.lazy)(()=>T(()=>import(`./GuidePage-D56LQgP9.js`).then(e=>({default:e.GuidePage})),__vite__mapDeps([33,1,2,4,6,5,7,8,3,9]))),ic=(0,A.lazy)(()=>T(()=>import(`./UnconfiguredOnus-W1q6wrc4.js`).then(e=>({default:e.UnconfiguredOnus})),__vite__mapDeps([34,1,2,3,4,5,6,7,8]))),ac=(0,A.lazy)(()=>T(()=>import(`./OnuWizard-CsAp6jRq.js`).then(e=>({default:e.OnuWizard})),__vite__mapDeps([35,1,2,3,4,5,6,7,8]))),oc=(0,A.lazy)(()=>T(()=>import(`./SystemUpdate-ByOZksKA.js`).then(e=>({default:e.SystemUpdate})),__vite__mapDeps([36,1,2,4,6,5,7,8,3]))),sc=(0,A.lazy)(()=>T(()=>import(`./OltLogs-C6FmNHvJ.js`).then(e=>({default:e.OltLogs})),__vite__mapDeps([37,1,2,4,5,6,7,8,3]))),cc=(0,A.lazy)(()=>T(()=>import(`./AutoProvision-FBHT0yYh.js`).then(e=>({default:e.AutoProvision})),__vite__mapDeps([38,1,2,4,6,5,7,8,3]))),lc={"/dashboard/onus/add":`add_onu`,"/dashboard/onus/register":`add_onu`,"/dashboard/onus/provision":`add_onu`,"/dashboard/onus/pre-config":`add_onu`,"/dashboard/onus/unconfigured":`add_onu`,"/dashboard/onus/wizard/register":`add_onu`,"/dashboard/onus/wizard/provision":`add_onu`,"/dashboard/onus/wizard/preconfig":`add_onu`,"/dashboard/settings/olts":`settings_ip_olts`,"/dashboard/customization":`customization`,"/dashboard/users":`manage_users`,"/dashboard/templates":`manage_templates`,"/dashboard/templates/tr069-profile":`manage_tr069`,"/dashboard/logs":`manage_users`,"/dashboard/settings/alerts":`customization`,"/dashboard/settings/cloudflare":`super_admin`,"/dashboard/settings/update":`super_admin`,"/dashboard/settings/auto-provision":`settings_ip_olts`},uc=[{pattern:/^\/dashboard\/settings\/olts\/\d+\/config$/,perm:`settings_ip_olts`}];function dc({children:e}){let{user:t,loading:n}=P(),{pathname:r}=pe();if(n&&!t)return(0,j.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,j.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,j.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,j.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,j.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,j.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})});if(!t)return(0,j.jsx)(me,{to:`/`,replace:!0});if(t.must_change_password&&r!==`/dashboard/profile`)return(0,j.jsx)(me,{to:`/dashboard/profile`,replace:!0});let i=lc[r];if(!i){for(let e of uc)if(e.pattern.test(r)){i=e.perm;break}}if(i){if(i===`super_admin`){if(!t.is_super_admin&&!new Set(t.permissions||[]).has(`all_olt`))return(0,j.jsx)(me,{to:`/dashboard`,replace:!0})}else{let e=new Set(t.permissions||[]);if(!t.is_super_admin&&!e.has(`all_olt`)&&!e.has(i))return(0,j.jsx)(me,{to:`/dashboard`,replace:!0})}}return(0,j.jsx)(j.Fragment,{children:e})}function fc(){let{fetchUser:e}=P();return(0,A.useEffect)(()=>{let t=window.location.pathname||`/`;t!==`/`&&t!==`/login`?e():P.setState({loading:!1}),fetch(`/api/public/branding`).then(e=>e.json()).then(e=>{e.timezone&&ze(e.timezone)}).catch(()=>{})},[e]),(0,j.jsx)(yt,{children:(0,j.jsx)(A.Suspense,{fallback:(0,j.jsx)(`div`,{className:`min-h-screen flex items-center justify-center bg-[var(--bg-primary)]`,children:(0,j.jsxs)(`div`,{className:`flex flex-col items-center gap-4`,children:[(0,j.jsxs)(`svg`,{className:`animate-spin h-8 w-8 text-accent`,viewBox:`0 0 24 24`,children:[(0,j.jsx)(`circle`,{className:`opacity-25`,cx:`12`,cy:`12`,r:`10`,stroke:`currentColor`,strokeWidth:`4`,fill:`none`}),(0,j.jsx)(`path`,{className:`opacity-75`,fill:`currentColor`,d:`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z`})]}),(0,j.jsx)(`p`,{className:`text-tx3 text-sm`,children:`Loading...`})]})}),children:(0,j.jsxs)(ye,{children:[(0,j.jsx)(E,{path:`/`,element:(0,j.jsx)(me,{to:`/login`,replace:!0})}),(0,j.jsx)(E,{path:`/login`,element:(0,j.jsx)(Ls,{})}),(0,j.jsxs)(E,{path:`/dashboard`,element:(0,j.jsx)(dc,{children:(0,j.jsx)(vt,{})}),children:[(0,j.jsx)(E,{index:!0,element:(0,j.jsx)(Rs,{})}),(0,j.jsx)(E,{path:`onus`,element:(0,j.jsx)(zs,{})}),(0,j.jsx)(E,{path:`onus/add`,element:(0,j.jsx)(Vs,{})}),(0,j.jsx)(E,{path:`onus/register`,element:(0,j.jsx)(Gs,{})}),(0,j.jsx)(E,{path:`onus/provision`,element:(0,j.jsx)(Ks,{})}),(0,j.jsx)(E,{path:`onus/pre-config`,element:(0,j.jsx)(Ks,{manualMode:!0})}),(0,j.jsx)(E,{path:`onus/unconfigured`,element:(0,j.jsx)(ic,{})}),(0,j.jsx)(E,{path:`onus/wizard/register`,element:(0,j.jsx)(ac,{mode:`register`})}),(0,j.jsx)(E,{path:`onus/wizard/provision`,element:(0,j.jsx)(ac,{mode:`provision`})}),(0,j.jsx)(E,{path:`onus/wizard/preconfig`,element:(0,j.jsx)(ac,{mode:`preconfig`})}),(0,j.jsx)(E,{path:`onus/:id`,element:(0,j.jsx)(Bs,{})}),(0,j.jsx)(E,{path:`all-onus/view-c3-r/gpon/:oltId/:frame/:slot/:onuNum`,element:(0,j.jsx)(Bs,{})}),(0,j.jsx)(E,{path:`settings/olts`,element:(0,j.jsx)(Hs,{})}),(0,j.jsx)(E,{path:`settings/olts/:oltId/config`,element:(0,j.jsx)(qs,{})}),(0,j.jsx)(E,{path:`customization`,element:(0,j.jsx)(Ws,{})}),(0,j.jsx)(E,{path:`users`,element:(0,j.jsx)(Us,{})}),(0,j.jsx)(E,{path:`profile`,element:(0,j.jsx)(Js,{})}),(0,j.jsx)(E,{path:`settings/alerts`,element:(0,j.jsx)(Ys,{})}),(0,j.jsx)(E,{path:`settings/cloudflare`,element:(0,j.jsx)(nc,{})}),(0,j.jsx)(E,{path:`settings/auto-provision`,element:(0,j.jsx)(cc,{})}),(0,j.jsx)(E,{path:`alerts/history`,element:(0,j.jsx)(ec,{})}),(0,j.jsx)(E,{path:`ftth`,element:(0,j.jsx)(Xs,{})}),(0,j.jsx)(E,{path:`templates`,element:(0,j.jsx)(Zs,{})}),(0,j.jsx)(E,{path:`templates/tr069-profile`,element:(0,j.jsx)(Qs,{})}),(0,j.jsx)(E,{path:`traffic`,element:(0,j.jsx)(tc,{})}),(0,j.jsx)(E,{path:`logs`,element:(0,j.jsx)($s,{})}),(0,j.jsx)(E,{path:`guide`,element:(0,j.jsx)(rc,{})}),(0,j.jsx)(E,{path:`settings/update`,element:(0,j.jsx)(oc,{})}),(0,j.jsx)(E,{path:`olt-logs`,element:(0,j.jsx)(sc,{})})]}),(0,j.jsx)(E,{path:`*`,element:(0,j.jsx)(me,{to:`/`,replace:!0})})]})})})}(localStorage.getItem(`theme`)||`dark`)===`light`&&document.documentElement.classList.add(`light`);var pc=new We({defaultOptions:{queries:{retry:1,staleTime:1e4,refetchOnWindowFocus:!1}}});(0,Ge.createRoot)(document.getElementById(`root`)).render((0,j.jsx)(A.StrictMode,{children:(0,j.jsx)(be,{children:(0,j.jsxs)(Me,{client:pc,children:[(0,j.jsx)(fc,{}),(0,j.jsx)(Ze,{}),(0,j.jsx)(et,{})]})})}));export{js as a,Os as c,dt as d,P as f,M as h,Ms as i,Es as l,$e as m,Fs as n,As as o,rt as p,Ps as r,ks as s,Is as t,Ts as u};