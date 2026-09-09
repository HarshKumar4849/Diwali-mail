import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "test-csvs");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sizes = [5, 14, 15, 25, 50];
for (const size of sizes) {
  let content = "Email,Name,Company\n";
  for (let i = 1; i <= size; i++) {
    content += `test.user${i}@example.com,User ${i},Acme Corp\n`;
  }
  const filePath = path.join(dir, `recipients-${size}.csv`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Created ${filePath} (${size} rows)`);
}
