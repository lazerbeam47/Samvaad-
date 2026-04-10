const {spawn}=require('child_process'); // Importing spawn from child_process module used to run Python scripts in a separate process
const path=require('path'); // Importing path module for handling file paths
const fs=require('fs'); // Importing fs module for file system operations

const pythonScript=path.join(__dirname,'..','whisper-worker','transcribe.py'); // Constructing the path to the Python script

function transcribeChunk(filePath){
    return new Promise((resolve,reject)=>{
        const process=spawn('python3',[pythonScript,filePath]); // Spawning a new Python process to run the transcription script

        let output=""; // Variable to accumulate stdout data
        let errorOutput=""; // Variable to accumulate stderr data

        process.stdout.on('data',(data)=>{
            output+=data.toString(); // Appending data received from stdout
        })

        process.stderr.on("data",(data)=>{
            errorOutput+=data.toString(); // Appending data received from stderr

        });
        process.on('close',(code)=>{
            if(code!==0){
                console.log("Python STT error:",errorOutput);
                reject(errorOutput); // Rejecting the promise if the process exits with a non-zero code
            }else{
                resolve(output.trim()); // Resolving the promise with the transcription result
            }
        });
    });
}

module.exports=transcribeChunk; // Exporting the transcribeChunk function for use in other modules