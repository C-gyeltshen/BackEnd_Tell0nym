import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { HTTPException } from "hono/http-exception";
import { decode, sign, verify } from "hono/jwt";
import { BADFAMILY } from 'dns';
import { jwtMiddleware } from './middlewares/authMiddleware';

const prisma = new PrismaClient();

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

//Protected Routs 
app.get('/protected-route', jwtMiddleware, (c) => {
  const user = c.get('jwtPayload'); 
  return c.json({ message: 'This is a protected route', user });
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


// post the reply and turn the status to 1
app.post('/tells/:tellid', async (c) => {
  try {
    const tellId = parseInt(c.req.param('tellid'));
    const { reply } = await c.req.json();

    // Check if the tell exists and has a status of 0
    const existingTell = await prisma.tells.findUnique({
      where: {
        id: tellId,
      },
    });

    if (!existingTell || existingTell.status !== 0) {
      return c.json({ error: 'Invalid tell or tell already answered' }, 400);
    }

    // Update the tell with the reply and set the status to 1
    const updatedTell = await prisma.tells.update({
      where: {
        id: tellId,
      },
      data: {
        reply,
        status: 1,
      },
    });

    return c.json(updatedTell);
  } catch (error) {
    console.error('Error updating tell:', error);
    return c.json({ error: 'An error occurred while updating the tell' }, 500);
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





// FOLLOW A USER
app.post('/follow', async (c) => {
  try {
    const { followerName, followingName } = await c.req.json();

    // Validate the input
    if (!followerName || !followingName) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Check if the follower and following are the same
    if (followerName === followingName) {
      return c.json({ error: 'You cannot follow yourself' }, 400);
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

    // Increment the follower count for the following user
    await prisma.users.update({
      where: { user_id: following.user_id },
      data: { followers: { increment: 1 } },
    });

    return c.json({ message: 'User followed successfully' });
  } catch (error) {
    console.error('Error following user:', error);
    return c.json({ error: `An error occurred while following the user: ${error.message}` }, 500);
  }
});




// GET THE FOLLOWERS AND FOLLOWING OF A USER
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

    // Decrement the follower count for the following user
    await prisma.users.update({
      where: { user_id: following.user_id },
      data: { followers: { decrement: 1 } },
    });

    return c.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return c.json({ error: `An error occurred while unfollowing the user: ${error.message}` }, 500);
  }
});


<<<<<<< Updated upstream

// GET user name
app.get('/users/:userId/username', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));

    // Find the user by their ID
    const user = await prisma.users.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        user_name: true,
      },
    });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user_name: user.user_name });
  } catch (error) {
    console.error('Error retrieving user name:', error);
    return c.json({ error: 'An error occurred while retrieving user name' }, 500);
  }
});

// Get tells with status 1
app.get('/tells/:userId', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));

    // Retrieve the tells for the specified user with status 1, including the message and reply fields
    const userTells = await prisma.tells.findMany({
      where: {
        receiver_id: userId,
        status: 1,
      },
      select: {
        id: true,
        sender_id: true,
        receiver_id: true,
        message: true,
        reply: true,
        user_name: true,
      },
    });

    if (userTells.length === 0) {
      return c.json({ message: 'No tells found for the specified user with status 1' });
    }

    return c.json(userTells);
  } catch (error) {
    console.error('Error retrieving user tells:', error);
    return c.json({ error: 'An error occurred while retrieving user tells' }, 500);
  }
});

// Endpoint for incrementing react_count meaning add
app.patch('/tells/:tellId/react', async (c) => {
  try {
    const tellId = parseInt(c.req.param('tellId'));

    // Find the existing tell by its ID
    const existingTell = await prisma.tells.findUnique({
      where: {
        id: tellId,
      },
    });

    if (!existingTell) {
      return c.json({ error: 'Tell not found' }, 404);
    }

    // Increment the react_count
    const updatedTell = await prisma.tells.update({
      where: {
        id: tellId,
      },
      data: {
        react_count: existingTell.react_count ? existingTell.react_count + 1 : 1,
      },
    });

    return c.json(updatedTell);
  } catch (error) {
    console.error('Error incrementing react count:', error);
    return c.json({ error: 'An error occurred while incrementing react count' }, 500);
  }
});

// add the comment
app.patch('/tells/:tellId/comment', async (c) => {
  try {
    const tellId = parseInt(c.req.param('tellId'));

    // Find the existing tell by its ID
    const existingTell = await prisma.tells.findUnique({
      where: {
        id: tellId,
      },
    });

    if (!existingTell) {
      return c.json({ error: 'Tell not found' }, 404);
    }

    // Increment the comment_count
    const updatedTell = await prisma.tells.update({
      where: {
        id: tellId,
      },
      data: {
        comment_count: existingTell.comment_count ? existingTell.comment_count + 1 : 1,
      },
    });

    return c.json(updatedTell);
  } catch (error) {
    console.error('Error incrementing comment count:', error);
    return c.json({ error: 'An error occurred while incrementing comment count' }, 500);
  }
});// Endpoint for incrementing comment_count


// get the counts
app.get('/tells/:tellId/counts', async (c) => {
  try {
    const tellId = parseInt(c.req.param('tellId'));

    // Find the tell by its ID
    const tell = await prisma.tells.findUnique({
      where: {
        id: tellId,
      },
      select: {
        react_count: true,
        comment_count: true,
      },
    });

    if (!tell) {
      return c.json({ error: 'Tell not found' }, 404);
    }

    return c.json(tell);
  } catch (error) {
    console.error('Error retrieving tell counts:', error);
    return c.json({ error: 'An error occurred while retrieving tell counts' }, 500);
  }
});



=======
>>>>>>> Stashed changes
const port = 8080;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
