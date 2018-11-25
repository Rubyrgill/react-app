//Depedencies 
//------------------------------------
var express = require("express");
//morgon logger used to log data to debug and check errors
var logger = require("morgan");
var exphbs = require("express-handlebars");
var cheerio = require("cheerio");
var axios = require("axios");
var mongoose = require("mongoose");
var path = require("path");
var bodyParser = require("body-parser")

//Initalize 
//------------------------------------
var app = express();


// Requiring Note and Article models
var Note = require("./models/article.js");
var Article = require("./models/note.js");

//Deploy
//------------------------------------

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHeadlines";

mongoose.Promise = Promise;

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true
});

var db = mongoose.connection;


//PORT
//------------------------------------
var PORT = process.env.PORT || 3000;

app.use(logger("dev"));
app.use(bodyParser.urlencoded({
    extended: false
}));
// Parse request body as JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));


app.engine("handlebars", exphbs({
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "/views/layouts")
}));
app.set("view engine", "handlebars");


// mongoose errors
db.on("error", function (error) {
    console.log("Mongoose Errors: ", error);
});

// success 
db.once("open", function () {
    console.log("Mongoose connected successful.");
});

//Routes
//------------------------------------
app.get('/', function (req, res) {
    res.render('allarticles');
});

app.get("/notsaved", function (req, res) {
    //execute callback limit 20 articles in homepage (ref mongoose query builder)
    Article.find({ "saved": false }).limit(20).exec(function (error, data) {
        var hbsObject = {
            article: data
        };
        console.log(hbsObject);
        res.render("notsaved", hbsObject);
    });
});


app.get("/saved", function (req, res) {
    Article.find({ "saved": true }).populate("notes").exec(function (error, articles) {
        var hbsObject = {
            article: articles
        };
        res.render("saved", hbsObject);
    });
});

// Clear the database to bring in an updated list
app.get("/empty", (req, res) => {
    db.collection('articles').deleteMany({ 'saved': false }, function (err, obj) {
        if (err) throw err;
        res.send(obj.result.n + " articles removed.");
    });
});


//GET route to scrape nytimes website
app.get("/scrape", function (req, res) {

    request("https://www.npr.org/sections/news/", function (error, response, html) {

        var $ = cheerio.load(html);
        // Find all elements with an article tag
        $("div.list-overflow > article").each(function (i, element) {
            $('time').remove();
            // Save an empty result object
            var result = {};

            // Add the title and summary of every link, and save them as properties of the result object
            result.title = $(element).children("div.item-info").children("h2.title").text();
            result.summary = $(element).children("div.item-info").children("p.teaser").children("a").text();
            result.link = $(element).children("div.item-info").children("h2.title").children("a").attr("href");

            // Create new entry and pass the result object to the entry
            var entry = new Article(result);

            // Now, save that entry to the db
            entry.save(function (err, doc) {
                // Log any errors
                if (err) {
                    console.log(err);
                }
                // Or log the doc
                else {
                    console.log(doc);
                }
            });

        });
        res.send("Scrape Complete");

    });

});
//Get the articles we scraped from the mongoDB
app.get("/articles", function (req, res) {
    //execute callback limit 20 in json document
    Article.find({}).limit(20).exec(function (error, doc) {
        // Log any errors if the server encounters one
        if (error) {
            console.log(error);
        }
        // Otherwise, send the result of this query to the browser
        else {
            res.json(doc);
        }
    });
});


// Grab an article by it's ObjectId
app.get("/articles/:id", function (req, res) {
    // Using the id parameter, query the matching one in the db
    Article.findOne({ "_id": req.params.id })
        // Populate all of the notes associated with the id
        .populate("note")
        // Execute the query
        .exec(function (error, doc) {
            // Log any errors
            if (error) {
                console.log(error);
            }
            // Otherwise, send the doc to the browser as a json object
            else {
                res.json(doc);
            }
        });
});


// Save an article
app.post("/articles/save/:id", function (req, res) {
    // Find and update the articles boolean by ID
    Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": true })
        // Execute the query
        .exec(function (err, doc) {
            // Log any errors
            if (err) {
                console.log(err);
            }
            else {
                // Or send the document to the browser
                res.send(doc);
            }
        });
});

// Delete an article
app.post("/articles/delete/:id", function (req, res) {
    // Find and update the articles boolean by ID
    Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": false, "notes": [] })
        // Execute the query
        .exec(function (err, doc) {
            // Log any errors
            if (err) {
                console.log(err);
            }
            else {
                // Or send the document to the browser
                res.send(doc);
            }
        });
});


// Create a new note
app.post("/notes/save/:id", function (req, res) {
    // Create a new note and pass the req.body to the entry
    var newNote = new Note({
        body: req.body.text,
        article: req.params.id
    });
    console.log(req.body)
    // And save the new note the db
    newNote.save(function (error, note) {
        // Log any errors
        if (error) {
            console.log(error);
        }
        // Otherwise
        else {
            // Use the article id to find and update it's notes
            Article.findOneAndUpdate({ "_id": req.params.id }, { $push: { "notes": note } })
                // Execute the above query
                .exec(function (err) {
                    // Log any errors
                    if (err) {
                        console.log(err);
                        res.send(err);
                    }
                    else {
                        // Or send the note to the browser
                        res.send(note);
                    }
                });
        }
    });
});

// Delete a note
app.delete("/notes/delete/:note_id/:article_id", function (req, res) {
    // Use the note id to find and delete it
    Note.findOneAndRemove({ "_id": req.params.note_id }, function (err) {
        // Log any errors
        if (err) {
            console.log(err);
            res.send(err);
        }
        else {
            Article.findOneAndUpdate({ "_id": req.params.article_id }, { $pull: { "notes": req.params.note_id } })
                // Execute the above query
                .exec(function (err) {
                    // Log any errors
                    if (err) {
                        console.log(err);
                        res.send(err);
                    }
                    else {
                        // Or send the note to the browser
                        res.send("Note Deleted");
                    }
                });
        }
    });
});


//Server Running
//------------------------------------
app.listen(PORT, function () {
    console.log("App running on port " + PORT + ".");
});

