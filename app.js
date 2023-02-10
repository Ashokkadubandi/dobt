const express = require("express");
const app = express();
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error at ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

app.use(express.json());

const convertSnakeCase = (data) => {
  return {
    name: data.name,
    tweet: data.tweet,
    dateTime: data.date_time,
  };
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkingQuery = `
select         
* from user where username = "${username}"    `;
  const userdata = await db.get(checkingQuery);
  if (userdata !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const isChecklen = password.length < 6;
    if (isChecklen === true) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const enhancedPas = await bcrypt.hash(password, 10);
      const query = `
            insert into user(
    username,password,name,gender)
    values('${username}','${enhancedPas}','${name}','${gender}')
            `;
      const userData = await db.run(query);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const readingQuery = `
        SELECT * FROM user WHERE username = "${username}"
    `;
  const data = await db.get(readingQuery);
  if (data === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isCheckpas = await bcrypt.compare(password, data.password);
    if (isCheckpas === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticationAccess = (request, response, next) => {
  const authHeaders = request.headers["authorization"];
  let jwtToken;
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        // console.log(payload);
        request.u = payload.username;
        const query = `
    select * from user where username = "${payload.username}"
  `;
        const data = await db.get(query);
        request.da = data;
        next();
      }
    });
  }
};

app.get(
  "/user/tweets/feed/",
  authenticationAccess,
  async (request, response) => {
    const { user_id } = request.da;
    const query = `
      select user.name,tweet.tweet,tweet.date_time from (follower inner join user 
      on follower.following_user_id = user.user_id) as T
      inner join tweet on T.user_id = tweet.user_id
      where follower.follower_user_id = ${user_id}
      order by name asc
      limit 4
      offset 0
    `;
    const q = `
    SELECT * FROM tweet
    `;
    data = await db.all(query);
    response.send(
      data.map((each) => {
        return convertSnakeCase(each);
      })
    );
  }
);

app.get("/user/following/", authenticationAccess, async (request, response) => {
  const { user_id } = request.da;
  const query = `
       select user.name from follower inner join user on
       follower.following_user_id = user.user_id
       where follower.follower_user_id = ${user_id}
    `;
  const data = await db.all(query);
  response.send(data);
});

app.get("/user/followers/", authenticationAccess, async (request, response) => {
  const { user_id } = request.da;
  const query = `
select user.name from follower inner join user on 
follower.follower_user_id = user.user_id
where following_user_id = ${user_id}

    `;
  const data = await db.all(query);
  response.send(data);
});
const findingWhoseTweetId = async (request, response, next) => {
  const { tweetId } = request.params;
  const query = `
        SELECT user_id FROM tweet
        where tweet_id = ${tweetId}
    `;
  const data = await db.get(query);
  request.u = data;
  next();
};

const followsUserId = async (request, response, next) => {
  const { user_id } = request.da;
  const userIdF = request.u.user_id;
  const query = `
  select * from follower inner join user on
  follower.following_user_id = user.user_id
  where follower_user_id = ${user_id} and following_user_id = ${userIdF}
   `;
  const data = await db.get(query);
  if (data.length === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    request.special = data;
    next();
  }
};
app.get(
  "/tweets/:tweetId/",
  authenticationAccess,
  findingWhoseTweetId,
  followsUserId,
  async (request, response) => {}
);
module.exports = app;
