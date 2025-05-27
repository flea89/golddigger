import { prisma } from "./prisma"

export async function createPost(formData: FormData) {
  'use server'
  const name = formData.get('name')
  const surname = formData.get('surname')
  const content = formData.get('content')

  await prisma.post.create({
    data: {
      name: name as string || '',
      surname: surname as string || '',
      content: content as string || '',
      isMongo: true,
    }
  })
}
