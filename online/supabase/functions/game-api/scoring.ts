export function computeScore(r: Record<string, any>, maxSeconds: number): number {
 const integer=(key:string,max:number)=>{const n=r[key];if(!Number.isInteger(n)||n<0||n>max)throw new Error('Invalid '+key);return n};
 const trip=r.version===5&&r.type==='free';
 const elapsed=integer('elapsed',7200),distance=integer('distance',1500000),safe=integer('safe',600),stops=integer('stops',600),crashes=integer('crashes',trip?8:3),penalty=integer('penalty',30000);
 if(elapsed>maxSeconds+15||distance>210*(elapsed+1)||stops>safe||safe>Math.floor(distance/550)+2)throw new Error('Round metrics out of range');
 if(typeof r.delivered!=='boolean')throw new Error('Invalid delivery');
 if(r.delivered&&(r.type!=='mission'||distance<2400||crashes>=3))throw new Error('Invalid delivery');
 const school=r.stats?.school,signals=r.stats?.signals;
 if(!Number.isInteger(school)||!Number.isInteger(signals)||school<0||signals<0||school+signals>safe)throw new Error('Invalid safety events');
 const clean=r.delivered&&crashes===0&&penalty===0;
 const bonus=school*50+signals*60+(safe-school-signals)*25;
 let distanceScore=Math.floor(distance/16);
 if(trip){
  const recovered=integer('recovered',5),routes=r.route_distance;
  if(!routes||!Number.isInteger(routes.community)||!Number.isInteger(routes.highway)||routes.community<0||routes.highway<0||Math.abs(routes.community+routes.highway-distance)>1)throw Error('Invalid route distance');
  distanceScore=Math.floor(routes.community/4+routes.highway/8);
  if(crashes>3+recovered||recovered>Math.min(5,Math.floor((distanceScore+bonus)/1500)))throw Error('Invalid recovery');
  if(typeof r.trip_completed!=='boolean'||(r.trip_completed&&(distanceScore+bonus-penalty<9000||crashes>=3+recovered)))throw Error('Invalid trip completion');
 }
 const score=Math.max(0,distanceScore+bonus+(r.delivered?100+(clean?100:0):0)-penalty);
 return trip?Math.min(9000,score):score;
}
