import ts from 'typescript';import fs from 'node:fs';
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
for(const folder of ['src','tests'])for(const name of fs.readdirSync(folder)){if(!name.endsWith('.ts'))continue;const path=folder+'/'+name;const source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);fs.writeFileSync(path,printer.printFile(source));}
