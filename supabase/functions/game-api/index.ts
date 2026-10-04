import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { computeScore } from './scoring.ts';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,key,{auth:{persistSession:false}});
const origins=(Deno.env.get('GAME_ALLOWED_ORIGINS')||'https://coldwarth-ship-it.github.io').split(',').map(s=>s.trim()).filter(Boolean);
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!origins.includes(origin))return respond({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return respond({error:'POST only'},405);
 if(Number(req.headers.get('content-length')||0)>16000)return respond({error:'Request too large'},413);
 try{
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return respond({error:'Sign in required'},401);
  const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return respond({error:'Sign in required'},401);
  const raw=await req.text();if(raw.length>16000)return respond({error:'Request too large'},413);const body=JSON.parse(raw);
  await db.from('ssar_profiles').upsert({user_id:user.id},{onConflict:'user_id',ignoreDuplicates:true});
  if(body.op==='progress'){const {data,error}=await db.from('ssar_profiles').select('progress').eq('user_id',user.id).single();if(error)throw error;return respond({profile:data.progress})}
  if(body.op==='equip'){const {data,error}=await db.rpc('ssar_equip',{p_user:user.id,p_item:body.item});if(error)throw error;return respond({profile:data})}
  if(body.op==='leaderboard'){
   let since:null|string=null;if(body.period==='weekly'){const now=new Date();const bkk=new Date(now.getTime()+7*3600000);bkk.setUTCHours(0,0,0,0);bkk.setUTCDate(bkk.getUTCDate()-(bkk.getUTCDay()+6)%7);since=new Date(bkk.getTime()-7*3600000).toISOString()}
   const {data,error}=await db.rpc('ssar_leaderboard',{p_since:since});if(error)throw error;return respond({rows:data})
  }
  if(body.op==='start'){
   if(!uuid(body.round_id)||!Number.isInteger(body.stage)||body.stage<0||body.stage>5||!['mission','free'].includes(body.type))throw Error('Invalid round');
   const {data:profile,error:pe}=await db.from('ssar_profiles').select('progress').eq('user_id',user.id).single();if(pe)throw pe;
   if(body.type==='mission'&&body.stage>0&&!profile.progress.completed.includes(body.stage-1))throw Error('Stage locked');
   const nickname=String(body.nickname||'Rider').trim().slice(0,16);if(!nickname)throw Error('Nickname required');
   const {count,error:ce}=await db.from('ssar_sessions').select('round_id',{count:'exact',head:true}).eq('user_id',user.id).gte('started_at',new Date(Date.now()-60000).toISOString());if(ce)throw ce;if((count||0)>=8)return respond({error:'Please wait before starting again'},429);
   const {error}=await db.from('ssar_sessions').insert({round_id:body.round_id,user_id:user.id,stage:body.stage,kind:body.type});if(error)throw error;
   const {error:ne}=await db.from('ssar_profiles').update({nickname}).eq('user_id',user.id);if(ne)throw ne;
   return respond({round_id:body.round_id})
  }
  if(body.op==='submit'){
   const r=body.result;if(!r||!uuid(r.id))throw Error('Invalid round');
   const {data:sess,error}=await db.from('ssar_sessions').select('*').eq('round_id',r.id).eq('user_id',user.id).single();if(error||!sess)throw Error('Round not found');
   if(r.stage!==sess.stage||r.type!==sess.kind)throw Error('Round mismatch');const age=(Date.now()-Date.parse(sess.started_at))/1000;if(age>7*86400)throw Error('Round expired');
   const score=computeScore(r,age);const {data,error:se}=await db.rpc('ssar_submit',{p_user:user.id,p_round:r.id,p_score:score,p_metrics:r});if(se)throw se;return respond(data)
  }
  return respond({error:'Unknown operation'},400);
 }catch{return respond({error:'ผลรอบหรือคำขอไม่ผ่านการตรวจสอบ กรุณาลองใหม่'},400)}
});
