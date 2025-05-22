export const dynamic = "force-dynamic";

import { prisma } from "./lib/prisma";
import { createPost } from "./lib/actions";
import CreatePost from "./components/createPost";


export default async function Home() {
  const postCount = await prisma.post.count();

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <h1>Post count {postCount}</h1>
        <h1> Create Post</h1>
        <CreatePost createPostAction={createPost} />
      </main>
    </div>
  );
}
