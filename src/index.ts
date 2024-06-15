import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
const port = 3001;
console.log(`Server is running on port ${port}`);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// ? Example of JSON response from backend to frontend
app.get("/example-json", (c) => {
  //! Get data from SQL DB using prisma or whatever
  const jsonmsg = { message: "Hello from backend!" };

  //! get data from MongoDB using mongoose or whatever

  //? do your business logic here
  // if sth {
  // do sth
  // else {
  // do sth else
  //}

  return c.json({ jsonmsg });
});

serve({
  fetch: app.fetch,
  port,
});
