import Fastify from "fastify";
import { routes } from "./routes";

const app = Fastify();

app.register(routes, {
  prefix: "/api/v1"
});

app.listen({ port: 3000 });
