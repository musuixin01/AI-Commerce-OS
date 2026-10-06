import { createApp } from "./app";
import { startCatalogGenerationWorker } from "./catalog-generation.worker";
import { startCatalogImageWorker } from "./catalog-image.worker";
createApp()
  .then(async (app) => {
    await app.listen(Number(process.env.PORT || 4100), "127.0.0.1");
    const worker = startCatalogGenerationWorker();
    const imageWorker = startCatalogImageWorker();
    console.log(
      "Commerce API http://127.0.0.1:4100" +
        (worker.configured
          ? " · catalog field worker enabled"
          : " · catalog field worker needs model config") +
        (imageWorker.configured
          ? " · catalog image worker enabled"
          : " · catalog image worker needs model config"),
    );
  })
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
