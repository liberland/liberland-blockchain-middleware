'use strict';

function makeGaEvent(act, cat, lbl) {
	return (req, res, next) => {
		req.ga.event(
			{
				action: act,
				category: cat,
				label: lbl,
			},
			() => {}
		);
		next();
	};
}

exports.makeGaEvent = makeGaEvent;
