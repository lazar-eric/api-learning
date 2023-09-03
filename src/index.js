const express = require('express');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const cors = require('cors');

const { Mongo, BaseCollection } = require('@amaui/mongo');
const { hash } = require('@amaui/utils');

const run = async () => {
  // APP
  const app = express();

  app.use(cors({ origin: '*' }));

  app.use(express.json());

  // http://localhost:4000
  const port = process.env.PORT || 4000;

  // Da uveze iz .env fajla skrivene varijable
  // i ubaci ih u process.env.
  dotenv.config();

  // MONGO
  // mongo konkecija
  const mongo = new Mongo({
    uri: process.env.MONGO_URL,
    name: process.env.MONGO_DATABASE_NAME
  });

  await mongo.connection;

  // Todos
  class Todos extends BaseCollection {
    constructor() {
      super('todos', mongo);
    }
  }

  const todos = new Todos();

  // Users
  class Users extends BaseCollection {
    constructor() {
      super('users', mongo);
    }
  }

  const users = new Users();

  // MIDDLEWARES
  const authMiddleware = async (req, res, next) => {
    try {
      // Izvuci user-a is request-a
      const token = req.headers.authorization;

      // Proveri da li je ispravan
      let data;

      try {
        data = jwt.verify(token, process.env.PRIVATE_KEY);
      }
      catch (error) {
        throw new Error('Token is invalid');
      }

      // Proveri da li user postoji u bazi
      const id = data.id;

      const user = await users.findOne({
        _id: new ObjectId(id)
      });

      if (!user) throw new Error('User not found');

      console.log('Auth middleware', data);

      // dodati usera u req objekat
      req.user = user;

      return next();
    }
    catch (error) {
      return next(error);
    }
  };

  // RUTE
  // Glavna ruta http://localhost:4000/ GET
  app.get(
    '/',
    authMiddleware,
    (req, res, next) => {
      console.log('Glavna metoda');

      return res.status(200).json({ response: 'Uspeh' });
    }
  );

  // USER rute
  // 1) /users POST - Registracija korisnika
  app.post(
    '/users',
    async (req, res, next) => {
      try {
        const user = {
          name: req.body.name,
          email: req.body.email,
          password: req.body.password
        };

        // 1) Proveriti da li user postoji u bazi vec sa ovim emailom
        if (!user.email) throw new Error('Email is required');

        const exists = await users.exists({
          email: user.email
        });

        if (exists) throw new Error(`User already exists with this email`);

        // 2) Password ne sme sirov da bude upisan ubazu
        // vec mora da se hashuje
        user.password = hash(user.password);

        const created = await users.addOne(user);

        // 3) Email
        // poslati email da je user uspesno registrovan

        return res.status(200).json({ response: 'Uspesno si registrovan!' });
      }
      catch (error) {
        return next(error);
      }
    }
  );

  // 2) /users/login POST - Login korisnika
  app.post(
    '/users/login',
    async (req, res, next) => {
      try {
        const user = {
          email: req.body.email,
          password: req.body.password
        };

        // 1) Proveriti da li user postoji u bazi vec sa ovim emailom
        const exists = await users.exists({
          email: user.email
        });

        if (!exists) throw new Error(`User not found`);

        // 2) Password da li je ispravan
        user.password = hash(user.password);

        const userDatabase = await users.findOne({
          email: user.email
        });

        if (userDatabase.password !== user.password) throw new Error('Password is incorrect');

        const data = {
          id: userDatabase._id.toString()
        };

        const token = jwt.sign(data, process.env.PRIVATE_KEY);

        return res.status(200).json({ response: token });
      }
      catch (error) {
        return next(error);
      }
    }
  );

  // TODO rute
  // Dodavanje novog todo-a u bazu
  // /todos POST - Kreiranje todo-ova
  app.post(
    '/todos',
    authMiddleware,
    async (req, res, next) => {
      const user = req.user;

      const id = user._id;
      const todo = req.body;

      // ovo dodajemo mi
      // u nasem api-u
      todo.user = id;
      todo.completed = false;

      const created = await todos.addOne(todo);

      return res.status(200).json(created);
    }
  );

  // Citanje todova iz baze
  // /todos GET - Citanje todo-ova
  app.get(
    '/todos',
    authMiddleware,
    async (req, res, next) => {
      const user = req.user;

      const id = user._id;

      const todovi = await todos.find({
        user: id
      });

      return res.status(200).json(todovi);
    }
  );

  // Citanje jednog todoa
  // /todos/:id GET - Kreiranje jednog todo-a
  app.get(
    '/todos/:id',
    authMiddleware,
    async (req, res, next) => {
      try {
        const user = req.user;
        const todoID = req.params.id;

        const id = user._id;

        const todo = await todos.findOne({
          _id: new ObjectId(todoID),
          user: id
        });

        if (!todo) throw new Error('Todo not found');

        return res.status(200).json(todo);
      }
      catch (error) {
        return next(error);
      }
    }
  );

  // Update jednog todoa
  // /todos/:id PUT - Update jednog todo-a
  app.put(
    '/todos/:id',
    authMiddleware,
    async (req, res, next) => {
      try {
        const user = req.user;
        const todoID = req.params.id;

        const id = user._id;

        const todo = await todos.findOne({
          _id: new ObjectId(todoID),
          user: id
        });

        if (!todo) throw new Error('Todo not found');

        const update = {};

        if (req.body.name !== undefined) update.name = req.body.name;

        if (req.body.completed !== undefined) update.completed = req.body.completed;

        const updated = await todos.updateOne(
          {
            _id: new ObjectId(todoID)
          },
          update
        );

        return res.status(200).json(updated);
      }
      catch (error) {
        return next(error);
      }
    }
  );

  // Brisanje jednog todoa
  // /todos/:id DELETE - Brisanje jednog todo-a
  app.delete(
    '/todos/:id',
    authMiddleware,
    async (req, res, next) => {
      try {
        const user = req.user;
        const todoID = req.params.id;

        const id = user._id;

        const todo = await todos.findOne({
          _id: new ObjectId(todoID),
          user: id
        });

        if (!todo) throw new Error('Todo not found');

        await todos.removeOne({
          _id: new ObjectId(todoID)
        });

        return res.status(200).json({ response: 'Todo je obrisan' });
      }
      catch (error) {
        return next(error);
      }
    }
  );

  // error middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);

    return res.status(500).json({ response: err.message || 'Neka greska se desila' });
  });

  // POKRETANJE API-a
  // Ovako pokrecemo nas
  // server odnosno API
  app.listen(port, () => {
    console.log(`API je pokrenut na ${port} portu, odnosno http://localhost:${port} urlu`);
  });
};

run();
