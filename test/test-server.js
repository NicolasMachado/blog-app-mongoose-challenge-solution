const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding BlogPost data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  return BlogPost.insertMany(seedData);
}

// generate an object represnting a blogpost.
// can be used to generate seed data for db
// or request.body data
function generateBlogPostData() {
  return {
    title: faker.lorem.sentence(),
    content: faker.lorem.sentences(),
    created: new Date(),
    author: {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName()
    }
  }
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  ata from one test does not stick
// around for next one
function tearDownDb() {
    console.warn('Deleting database');
    return mongoose.connection.dropDatabase();
}

describe('Restaurants API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedBlogPostData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  })

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing blog posts', function() {
      // strategy:
      //    1. get back all blogposts returned by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of blogposts we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          // so subsequent .then blocks can access resp obj.
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          res.body.should.have.length.of(count);
        });
    });


    it('should return blog posts with right fields', function() {
      // Strategy: Get back all blogposts, and ensure they have expected keys

      let resBlogPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(blogpost) {
            blogpost.should.be.a('object');
            blogpost.should.include.keys(
              'id', 'title', 'author', 'content', 'created');
          });
          resBlogPost = res.body[0];
          return BlogPost.findById(resBlogPost.id);
        })
        .then(function(blogpost) {
          console.log(blogpost.author);
          console.log(resBlogPost.author);
          resBlogPost.id.should.equal(blogpost.id);
          resBlogPost.title.should.equal(blogpost.title);
          resBlogPost.content.should.equal(blogpost.content);
          resBlogPost.created.should.equal(blogpost.created.toISOString());
          resBlogPost.author.should.equal(`${blogpost.author.firstName} ${blogpost.author.lastName}`);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the blogpost we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog post', function() {

      const newBlogPost = generateBlogPostData();

      return chai.request(app)
        .post('/posts')
        .send(newBlogPost)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'content', 'title', 'author');
          res.body.title.should.equal(newBlogPost.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.content.should.equal(newBlogPost.content);
          res.body.author.should.be.a('string');
          return BlogPost.findById(res.body.id);
        })
        .then(function(blogspot) {
          blogspot.title.should.equal(newBlogPost.title);
          blogspot.content.should.equal(newBlogPost.content);
          blogspot.author.should.be.a('object');
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing blogpost from db
    //  2. Make a PUT request to update that blogpost
    //  3. Prove blogpost returned by request contains data we sent
    //  4. Prove blogpost in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        title: 'fofofofofofofof',
        content: 'futuristic fusion'
      };

      return BlogPost
        .findOne()
        .exec()
        .then(function(blogpost) {
          updateData.id = blogpost.id;

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${blogpost.id}`)
            .send(updateData);
        })
        .then(function(res) {
          res.should.have.status(204);

          return BlogPost.findById(updateData.id).exec();
        })
        .then(function(blogpost) {
          blogpost.title.should.equal(updateData.title);
          blogpost.content.should.equal(updateData.content);
        });
      });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a blogpost
    //  2. make a DELETE request for that blogpost's id
    //  3. assert that response has right status code
    //  4. prove that blogpost with the id doesn't exist in db anymore
    it('delete a blog post by id', function() {

      let blogpost;

      return BlogPost
        .findOne()
        .exec()
        .then(function(_blogpost) {
          blogpost = _blogpost;
          return chai.request(app).delete(`/posts/${blogpost.id}`);
        })
        .then(function(res) {
          res.should.have.status(204);
          return BlogPost.findById(blogpost.id).exec();
        })
        .then(function(_blogpost) {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_blogpost.should.be.null` would raise
          // an error. `should.be.null(_blogpost)` is how we can
          // make assertions about a null value.
          should.not.exist(_blogpost);
        });
    });
  });
});
