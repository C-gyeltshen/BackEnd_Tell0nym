import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { HTTPException } from "hono/http-exception";
import { decode, sign, verify } from "hono/jwt";
import { BADFAMILY } from 'dns';

const prisma = new PrismaClient();

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

// User signUp
app.post('/signup', async (c) => {
  try {
    const body = await c.req.json();

    const hashedPassword = await bcrypt.hash(body.password, 10);

    const user = await prisma.users.create({
      data: {
        email: body.email,
        password: hashedPassword,
        user_name: body.user_name
      },
    });

    console.log(user);
    return c.json({ message: `${user.email} created successfully` });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        console.log('There is a unique constraint violation, a new user cannot be created with this email');
        return c.json({ message: 'Email already exists' }, 409);
      }
    }
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// User login
app.post('/login', async (c)=>{
  try{

    const body = await c.req.json();

    const user = await prisma.users.findUnique({
      where:{
        email: body.email
      },
      select: { email: true, password: true },
    });
    if (!user) {
      return c.json({ message: "User not found" }, 404);
    }
    const passwordMatch = await bcrypt.compare(body.password, user.password);
      if (!passwordMatch) {
        throw new HTTPException(401, { message: "Invalid credentials" });
      }
      const payload = {
        sub: body.email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      };
      const secret = process.env.JWT_SECRET || "mySecretKey";
      const token = await sign(payload, secret);
      return c.json({ message: "Login successful", token });


  }catch (error) {
    console.error(error);
    throw new HTTPException(401, { message: "Invalid credentials" });
  }
});


// Adding tells in the tells table
app.post('/tells', async (c) => {
  try {
    const { sender_id, receiver_id, message, status, user_name } = await c.req.json();

    // Validate the input (you might want to add more comprehensive validation)
    if (!sender_id || !receiver_id || !message || !user_name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Create a new record in the `tells` table
    const newTell = await prisma.tells.create({
      data: {
        sender_id,
        receiver_id,
        message,
        status,
        user_name,
      },
    });

    return c.json(newTell);
  } catch (error) {
    console.error('Error creating tell:', error);
    return c.json({ error: 'An error occurred while creating the tell' }, 500);
  }
});

app.get('/private/inbox', async (c) => {
  try {
    const statusZeroRecords = await prisma.tells.findMany({
      where: { status: 0 } 
    });

    if (statusZeroRecords.length === 0) {
      return c.json({ message: 'No tells found with status false' });
    }

    return c.json(statusZeroRecords);
  } catch (error) { 
    console.error(error);
    return c.status(500).json({ error: 'Internal Server Error' });
  }
});

// app.patch('/inbox/update',async (c)=>{
//   try {
//     const status_update = await prisma.tells.update({
//       where : 
        
  
//     })
//   } catch (c){

//   }
// })




// follow a user
app.post('/follow', async (c) => {
  try {
    const { followerName, followingName } = await c.req.json();

    // Validate the input
    if (!followerName || !followingName) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Fetch the follower and following user records
    const follower = await prisma.users.findUnique({
      where: { user_name: followerName },
    });

    const following = await prisma.users.findUnique({
      where: { user_name: followingName },
    });

    // Ensure both users exist
    if (!follower || !following) {
      return c.json({ error: 'One or both users not found' }, 404);
    }

    // Check if the following relationship already exists
    const existingFollowing = await prisma.following.findUnique({
      where: { user_id_following_id: { user_id: follower.user_id, following_id: following.user_id } },
    });

    if (existingFollowing) {
      return c.json({ message: 'User is already following' }, 409);
    }

    // Create a new follower record
    await prisma.followers.create({
      data: {
        user_id: following.user_id,
        follower_id: follower.user_id,
        user_name: follower.user_name,
      },
    });

    // Create a new following record
    await prisma.following.create({
      data: {
        user_id: follower.user_id,
        following_id: following.user_id,
        user_name: following.user_name,
      },
    });

    return c.json({ message: 'User followed successfully' });
  } catch (error) {
    console.error('Error following user:', error);
    return c.json({ error: `An error occurred while following the user: ${error.message}` }, 500);
  }
});

// Get followers of a user
app.get('/following/:userName', async (c) => {
  const { userName } = c.req.param();

  try {
    // Fetch the user to get the user_id
    const user = await prisma.users.findUnique({
      where: { user_name: userName },
      select: { user_id: true },
    });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Fetch the following relationships with user details
    const following = await prisma.following.findMany({
      where: { user_id: user.user_id },
      include: { user: { select: { user_name: true, email: true } } }, // Add other fields you want to include
    });

    return c.json(following);
  } catch (error) {
    console.error('Error fetching following:', error);
    return c.json({ error: 'An error occurred while fetching following relationships' }, 500);
  }
});



// Unfollow a user
app.post('/unfollow', async (c) => {
  try {
    const { followerName, followingName } = await c.req.json();

    // Validate the input
    if (!followerName || !followingName) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Fetch the follower and following user records
    const follower = await prisma.users.findUnique({
      where: { user_name: followerName },
    });

    const following = await prisma.users.findUnique({
      where: { user_name: followingName },
    });

    // Ensure both users exist
    if (!follower || !following) {
      return c.json({ error: 'One or both users not found' }, 404);
    }

    // Check if the following relationship exists
    const existingFollowing = await prisma.following.findUnique({
      where: { user_id_following_id: { user_id: follower.user_id, following_id: following.user_id } },
    });

    if (!existingFollowing) {
      return c.json({ message: 'User is not following' }, 409);
    }

    // Delete the follower record
    await prisma.followers.delete({
      where: {
        user_id_follower_id: { user_id: following.user_id, follower_id: follower.user_id }
      },
    });

    // Delete the following record
    await prisma.following.delete({
      where: {
        user_id_following_id: { user_id: follower.user_id, following_id: following.user_id }
      },
    });

    return c.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return c.json({ error: `An error occurred while unfollowing the user: ${error.message}` }, 500);
  }
});




const port = 8080;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
