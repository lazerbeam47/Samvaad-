function scoreSignals(nluOutput){
    let risk=0;
    let opportunity=0;

    //Risk Signals
    if(nluOutput.intent==="complaint")risk+=30;
    if(nluOutput.compliance?.length)risk+=20;
    if(nluOutput.sentiment==="negative")risk+=25;

    //Opportunity Signals
    if(nluOutput.intent==="upsell")opportunity+=40;
    if(nluOutput.intent==="upgrade")opportunity+=30;
    if(nluOutput.sentiment==="positive")opportunity+=20;

    return {
        risk:Math.min(risk,100),
        opportunity:Math.min(opportunity,100),
    };
}

module.exports={
    scoreSignals
};
