import { runTechnicalAgent } from "../agents/technical";

async function main() {
  const [, , code = "000001", stockName = code] = process.argv;
  const result = await runTechnicalAgent({ code, stockName });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
