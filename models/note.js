//require mongoose 
var mongoose = require("mongoose");

var Schema = mongoose.Schema;

// Create new note obj
var NoteSchema = new Schema({
    body: {
        type: String
    },
    article: {
        type: Schema.Types.ObjectId,
        ref: "Article"
    }
});

// Create the Note model using mongoose's model method
var Note = mongoose.model("Note", NoteSchema);

//export
module.exports = Note;