/** Transient, single-location GBP dashboard. Never stores Google content or aggregates. */
import { z } from "zod";

export const dashboardMetrics = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "WEBSITE_CLICKS", "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS"] as const;
export const dashboardInput = z.object({siteId:z.string().min(1).max(80),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),metric:z.enum(dashboardMetrics)}).strict();
export function monthWindow(month:string,now=new Date()) {
  const [year,m]=month.split("-").map(Number), offset=(now.getUTCFullYear()-year)*12+now.getUTCMonth()-(m-1);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||offset<0||offset>11)throw new Error("LOCAL_INVALID");
  const start=new Date(Date.UTC(year,m-1,1)), yesterday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-1));
  const end=new Date(Math.min(Date.UTC(year,m,0),yesterday.getTime()));
  return {start,end,days:Math.max(0,Math.round((end.getTime()-start.getTime())/86400000)+1)};
}
export function performanceQuery(month:string,metric:typeof dashboardMetrics[number],now=new Date()) {
  const window=monthWindow(month,now),query=new URLSearchParams({dailyMetrics:metric});
  for(const [key,date] of [["start_date",window.start],["end_date",window.end]] as const) {
    query.set(`dailyRange.${key}.year`,String(date.getUTCFullYear()));query.set(`dailyRange.${key}.month`,String(date.getUTCMonth()+1));query.set(`dailyRange.${key}.day`,String(date.getUTCDate()));
  }
  return {query,window};
}
const reviewSchema=z.object({averageRating:z.number().min(0).max(5).optional(),totalReviewCount:z.number().int().nonnegative().optional(),nextPageToken:z.string().optional(),reviews:z.array(z.object({starRating:z.enum(["ONE","TWO","THREE","FOUR","FIVE","STAR_RATING_UNSPECIFIED"]).optional()})).max(50).default([])});
export function reviewSummary(raw:unknown) {
  const parsed=reviewSchema.safeParse(raw);if(!parsed.success)throw new Error("GBP_REMOTE");const d=parsed.data;
  const counts={positive:0,negative:0,neutral:0,unknown:0};
  for(const r of d.reviews){if(r.starRating==="FOUR"||r.starRating==="FIVE")counts.positive++;else if(r.starRating==="ONE"||r.starRating==="TWO")counts.negative++;else if(r.starRating==="THREE")counts.neutral++;else counts.unknown++;}
  return {total:d.totalReviewCount??null,average:d.averageRating&&d.totalReviewCount!==0?d.averageRating:null,sample:{...counts,size:d.reviews.length,complete:!d.nextPageToken&&d.totalReviewCount!==undefined&&d.reviews.length===d.totalReviewCount}};
}
const dateSchema=z.object({year:z.number().int(),month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31)});
const valueSchema=z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative()]).transform(Number).refine(Number.isSafeInteger);
const performanceSchema=z.object({multiDailyMetricTimeSeries:z.array(z.object({dailyMetricTimeSeries:z.array(z.object({dailyMetric:z.string(),dailySubEntityType:z.unknown().optional(),timeSeries:z.object({datedValues:z.array(z.object({date:dateSchema,value:valueSchema.optional()})).max(31).default([])}).optional()})).max(10).default([])})).max(10).default([])});
export function performanceSeries(raw:unknown,month:string,metric:string,now=new Date()) {
  const parsed=performanceSchema.safeParse(raw);if(!parsed.success)throw new Error("GBP_REMOTE");
  const window=monthWindow(month,now), matching=parsed.data.multiDailyMetricTimeSeries.flatMap(x=>x.dailyMetricTimeSeries).filter(x=>x.dailyMetric===metric);
  // Never combine sub-entity series or silently overwrite duplicate days.
  if(matching.length>1||matching.some(x=>x.dailySubEntityType))throw new Error("GBP_REMOTE");
  const values=new Map<string,number|null>();
  for(const point of matching[0]?.timeSeries?.datedValues??[]) {
    const {year,month:m,day}=point.date, date=new Date(Date.UTC(year,m-1,day)),key=date.toISOString().slice(0,10);
    if(date.getUTCDate()!==day||key.slice(0,7)!==month||date>window.end||values.has(key))throw new Error("GBP_REMOTE");
    values.set(key,point.value??null);
  }
  const points=Array.from({length:window.days},(_,i)=>{const date=new Date(window.start.getTime()+i*86400000).toISOString().slice(0,10);return {date,value:values.get(date)??null};});
  return {points,reportedDays:points.filter(x=>x.value!==null).length,expectedDays:window.days};
}
export function dashboardError(error:unknown) {
  const code=error instanceof Error?error.message:"";
  return {status:"unavailable" as const,code:["GBP_ACCESS","GBP_QUOTA","GBP_UNAVAILABLE"].includes(code)?code:"GBP_REMOTE"};
}
