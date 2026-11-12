/** RFC 4180-style CSV, bounded before parsing. JSON remains available for structured imports. */
export function parseRegistryCsv(text) {
  if (text.length > 1000000) throw new Error("LOCAL_CAPACITY");
  const rows = []; let row = [], cell = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||closed)throw new Error("LOCAL_INVALID");quoted=true;continue;}
    if(c===","||c==="\n"||c==="\r"){
      row.push(cell);cell="";closed=false;
      if(c!==","){if(c==="\r"&&text[i+1]==="\n")i++;if(row.some(Boolean))rows.push(row);row=[];}
      continue;
    }
    if(closed)throw new Error("LOCAL_INVALID");cell+=c;
  }
  if(quoted)throw new Error("LOCAL_INVALID");row.push(cell);if(row.some(Boolean))rows.push(row);
  if(rows.length<2||rows.length>1001)throw new Error("LOCAL_INVALID");
  const headers=rows.shift().map(v=>v.trim());
  const allowed=["id","name","brand","country","languages","timezone","kind","page","phone"];
  if(new Set(headers).size!==headers.length||headers.some(h=>!allowed.includes(h))||allowed.slice(0,8).some(h=>!headers.includes(h)))throw new Error("LOCAL_INVALID");
  return rows.map(values=>{if(values.length!==headers.length)return {};const item=Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()]));item.languages=item.languages.split(";").filter(Boolean);if(!item.phone)delete item.phone;return item;});
}
