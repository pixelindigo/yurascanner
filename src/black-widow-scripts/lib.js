/*
 * Simulate.js from https://github.com/airportyh/simulate.js
 */
!function() {
	function extend(dst, src) {
		for ( var key in src)
			dst[key] = src[key]
		return src
	}
	var Simulate = {
		event : function(element, eventName) {
			if (document.createEvent) {
				var evt = document.createEvent("HTMLEvents")
				evt.initEvent(eventName, true, true)
				element.dispatchEvent(evt)
			} else {
				var evt = document.createEventObject()
				element.fireEvent('on' + eventName, evt)
			}
		},
		keyEvent : function(element, type, options) {
			var evt, e = {
				bubbles : true,
				cancelable : true,
				view : window,
				ctrlKey : false,
				altKey : false,
				shiftKey : false,
				metaKey : false,
				keyCode : 0,
				charCode : 0
			}
			extend(e, options)
			if (document.createEvent) {
				try {
					evt = document.createEvent('KeyEvents')
					evt.initKeyEvent(type, e.bubbles, e.cancelable, e.view,
							e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
							e.keyCode, e.charCode)
					element.dispatchEvent(evt)
				} catch (err) {
					evt = document.createEvent("Events")
					evt.initEvent(type, e.bubbles, e.cancelable)
					extend(evt, {
						view : e.view,
						ctrlKey : e.ctrlKey,
						altKey : e.altKey,
						shiftKey : e.shiftKey,
						metaKey : e.metaKey,
						keyCode : e.keyCode,
						charCode : e.charCode
					})
					element.dispatchEvent(evt)
				}
			}
		}
	}
	Simulate.keypress = function(element, chr) {
		var charCode = chr.charCodeAt(0)
		this.keyEvent(element, 'keypress', {
			keyCode : charCode,
			charCode : charCode
		})
	}
	Simulate.keydown = function(element, chr) {
		var charCode = chr.charCodeAt(0)
		this.keyEvent(element, 'keydown', {
			keyCode : charCode,
			charCode : charCode
		})
	}
	Simulate.keyup = function(element, chr) {
		var charCode = chr.charCodeAt(0)
		this.keyEvent(element, 'keyup', {
			keyCode : charCode,
			charCode : charCode
		})
	}
	Simulate.change = function(element) {
		var evt = document.createEvent("HTMLEvents");
		evt.initEvent("change", false, true);
		element.dispatchEvent(evt);

	}
	//Simulate.click = function(element){
	//	element.click();
	//}
	var events = ['click','focus', 'blur', 'dblclick', 'input', 'mousedown',
			'mousemove', 'mouseout', 'mouseover', 'mouseup', 'resize',
			'scroll', 'select', 'submit', 'load', 'unload', 'mouseleave' ]
	for (var i = events.length; i--;) {
		var event = events[i]
		Simulate[event] = (function(evt) {
			return function(element) {
				this.event(element, evt)
			}
		}(event))
	}
	if (typeof module !== 'undefined') {
		module.exports = Simulate
	} else if (typeof window !== 'undefined') {
		window.Simulate = Simulate
	} else if (typeof define !== 'undefined') {
		define(function() {
			return Simulate
		})
	}
}();
/*
 * From down here
 * 
 *Copyright (C) 2015 Constantin Tschuertz
 *Copyright (C) 2022 Tim Recktenwald
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 *This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/*
This code was taken primarily from Constantin Tschuertz as part of the jÄk crawler implementation available at
https://github.com/ConstantinT/jAEk. Some parts of the code were either removed or altered to allow for integration into
Chikara. Modified segments are marked with [PATCH].
*/

// Test for send wrapper (TODO)
need_to_wait = false;
var original = XMLHttpRequest.prototype['open'];
XMLHttpRequest.prototype['open'] = function() {
  need_to_wait = true;
  return original.apply(this, arguments);
}
// End of test 

function callbackWrap(object, property, argumentIndex, wrapperFactory) {
	var original = object[property];
	object[property] = function() {
		wrapperFactory(this, arguments);
		return original.apply(this, arguments);
	}
	return original;
}

var max_waiting_time = 65000
var min_waiting_time = 0

function timingCallbackWrap(object, property, argumentIndex, wrapperFactory) {
	var original = object[property];

	object[property] = function() {
		if (arguments[1] > max_waiting_time) {
			arguments[1] = max_waiting_time
		}
		wrapperFactory(this, arguments);
		return original.apply(this, arguments);
	}
	return original;
}

function callInterceptionWrapper(object, property, argumentIndex,
		wrapperFactory) {
	var original = object[property];
	object[property] = function() {
		wrapperFactory(this, arguments);
		return null;
	}
	return original;
}

function XMLHTTPObserverOpen(elem, args) {
	resp = {
		"url" : args[1],
		"method" : args[0]
	};
	random_num =  Math.floor((Math.random() * 10000) + 1);
	//console.log("Uniq Id set: " + random_num);
	elem.jaeks_id = random_num;
	//resp = JSON.stringify(resp);
  	timeouts.push(resp);
  	console.log("Observer " + resp);
	//jswrapper.xmlHTTPRequestOpen(resp)
}

function XMLHTTPObserverSend(elem, args) {
	elems = []
	for (i = 0; i < args.length; i++) {
		elems.push(args[i])
	}
	resp = {
		"parameters" : elems
	};
	//console.log("Uniq Id: " + elem.jaeks_id);
	resp = JSON.stringify(resp)
  	console.log("Send " + resp);
	//jswrapper.xmlHTTPRequestSend(resp)
}

window_open_urls = []
function openWrapper(elem, args) {
    window_open_urls.push(args[0])
}

timeouts = Array();
function timeoutWrapper(elem, args) {
	function_id = MD5(args[0].toString());
	resp = {
		"function_id" : function_id,
		"function_name" : args[0].name,
		"time" : args[1]
	};
  	//resp = JSON.stringify(resp)
  	timeouts.push(resp);
	//jswrapper.timeout(resp)
}

function intervallWrapper(elem, args) {
	function_id = MD5(args[0].toString());
	resp = {
		"function_id" : function_id,
		"time" : args[1]
	};
	resp = JSON.stringify(resp)
	//jswrapper.intervall(resp)
}

function getXPath(element) {

	try {
		var xpath = '';

    // Updated by Benjamin
    if (element.id) {
      return '//*[@id="'+element.id+'"]';
    }
    // 

		for (; element && element.nodeType == 1; element = element.parentNode) {

			var sibblings = element.parentNode.childNodes;
			var same_tags = []
			for (var i = 0; i < sibblings.length; i++) { // collecting same
				if (element.tagName === sibblings[i].tagName) {
					same_tags[same_tags.length] = sibblings[i]
				}
			}

			var id = same_tags.indexOf(element) + 1;
			id > 1 ? (id = '[' + id + ']') : (id = '');
			xpath = '/' + element.tagName.toLowerCase() + id + xpath;
		}
		return xpath;
	} catch (e) {
		console.log("Error: " + e)
		return "";
	}
}



added_events = Array();
function addEventListenerWrapper(elem, args) {
	let tag = elem.tagName;
	let id = elem.id;
	let html_class = elem.className;
  	//console.log("AddEventLIstenerWrapper: " + tag + " - Event: " + args[0] + " ID " + id)
	let dom_address = getXPath(elem);

	if( !dom_address ) {
		console.log("No dom_address, using fake-id")
		elem.id = MD5(elem.outerHTML);
		dom_address = '//*[@id="'+elem.id+'"]';
	}

	// If an event handler was added with jQuery, it will always be the same dispatch function.
	// To distinguish different handlers for the same element, we have to incorporate the event type and dom address
	// into the hash.
	let function_id = MD5(args[1].toString() + args[0] + dom_address);	// <- PATCH

	let resp = {
		"element": elem,		// <- PATCH
		"event" : args[0],
		"function": args[1], 	// <- PATCH
		"function_id" : function_id,
		"addr" : dom_address,
		"id" : id,
		"tag" : tag,
		"class" : html_class
	}
  	added_events.push( resp )

	console.log('Event handler added:', resp);

	// TODO (?) This branch is currently not in use
	if (args[0] == "change") {
		inputs = elem.querySelectorAll("input");
		selects = elem.querySelectorAll("select");
		options = elem.querySelectorAll("option");

		for (i = 0; i < inputs.length; i++) {
			e = inputs[i];
			if (e.getAttribute("type") == "radio"
					|| e.getAttribute("type") == "checkbox") {
				tag = e.tagName
				id = e.id;
				html_class = e.className;
				dom_address = getXPath(e);
				function_id = "";
				resp = {
					"event" : "change",
					"function": args[1], // <- PATCH
					"function_id" : function_id,
					"addr" : dom_address,
					"id" : id,
					"tag" : tag,
					"class" : html_class
				}
			}
		}
		for (i = 0; i < selects.length; i++) {
			s = selects[i];
			tag = s.tagName
			id = s.id;
			html_class = s.className;
			dom_address = getXPath(s);
			function_id = "";
			resp = {
				"event" : "change",
				"function": args[1], // <- PATCH
				"function_id" : function_id,
				"addr" : dom_address,
				"id" : id,
				"tag" : tag,
				"class" : html_class
			}
		}
		for (xx = 0; xx < options.length; xx++) {
			element = options[i]
			tag = element.tagName
			id = element.id;
			html_class = element.className;
			dom_address = getXPath(element);
			function_id = "";
			resp = {
				"event" : "change",
				"function": args[1], // <- PATCH
				"function_id" : function_id,
				"addr" : dom_address,
				"id" : id,
				"tag" : tag,
				"class" : html_class
			}
		}
	}

	// TODO: What was the use of this code snippet? It also only detects uppercase <TABLE> tags
    /*if (tag == "TABLE" && args[0] == "click"){
        candidates = elem.querySelectorAll("button");
        for( xx = 0; xx < candidates.length; xx++) {
            var element = candidates[xx];
            tag = element.tagName;
            id = element.id;
            html_class = element.className;
            dom_address = getXPath(element);
            function_id = "";
            resp = {
                "event": "click",
				"function": args[1], // <- PATCH
                "function_id": function_id,
                "addr": dom_address,
                "id": id,
                "tag": tag,
                "class": html_class
            };
            added_events.push( resp )
            //console.log(element.click)
        }
    }*/
}

function bodyAddEventListenerWrapper(elem, args) {
	let tag = "body";
	let id = elem.id;
	let html_class = elem.className;

	// If an event handler was added with jQuery, it will always be the same dispatch function.
	// To distinguish different handlers for the same element, we have to incorporate the event type and dom address
	// into the hash.
	let dom_address = "/html/body";
	let function_id = MD5(args[1].toString() + args[0] + dom_address);	// <- PATCH

	let resp = {	// NOTE THAT THIS IS CURRENTLY ADDED NOWHERE!
		"element": elem,	 // <- PATCH
		"event" : args[0],
		"function": args[1], // <- PATCH
		"function_id" : function_id,
		"addr" : dom_address,
		"id" : id,
		"tag" : tag,
		"class" : html_class
	}

}

