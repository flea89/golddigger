'use client'

import { useRouter } from "next/navigation";

export default function CreatePost({
  createPostAction,
}: {
  createPostAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();

  const submit = async (formData: FormData) => {
    await createPostAction(formData);
    router.refresh();
  }

  return <form action={submit} className="flex flex-col gap-[32px]">
  <div className="flex flex-col gap-4">
    <input
      type="text"
      name="name"
      placeholder="Name"
      className="border border-gray-300 rounded p-2"
    />
    <input
      type="text"
      name="surname"
      placeholder="Surname"
      className="border border-gray-300 rounded p-2"
    />
    <textarea
      name="content"
      placeholder="Content"
      className="border border-gray-300 rounded p-2 h-[200px]"
    />
  </div>
  <button
    type="submit"
    className="bg-blue-500 text-white rounded p-2 mt-4"
  >
    Submit
  </button>
</form>
}
