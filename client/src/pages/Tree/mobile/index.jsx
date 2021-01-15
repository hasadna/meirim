import React, { useState } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { useScrollPosition } from '@n8tb1t/use-scroll-position';
import Wrapper from 'components/Wrapper';
import { CommentSelectors, UserSelectors } from 'redux/selectors';
import { Header, Navigation } from './containers';
import * as SC from './style';
import { openModal } from 'redux/modal/slice';
import { useDispatch } from 'react-redux';
import Footer from 'components/Footer';

const Template = ({
	children,
	commentState,
	setCommentState,
	match,
	 }) => {
	const [tabsPanelRef, setTabsPanelRef] = useState(null);
	const [fixedHeader, setFixedHeader] = useState(false);

	const { comments } = CommentSelectors();
	const isPlanHaveComments = comments.length > 0;
	let tabsPanelTop = tabsPanelRef && tabsPanelRef.current ? tabsPanelRef.current.getBoundingClientRect().top : null;

	const handleTabsPanelRef = (ref) => setTabsPanelRef(ref);
	const handleFixedHeader = (newValue) => setFixedHeader(newValue);

	const { isAuthenticated } = UserSelectors();
	const dispatch = useDispatch();

	const newCommentViewHandler = () =>{
		if (isAuthenticated){
			setCommentState(pv => ({ ...pv, isOpen: true }));
		} else {
			dispatch(openModal({ modalType: 'login' }));
		}
	};
    
	const mainClasses = classnames({
		'no-comments': !isPlanHaveComments,
		'new-comment': commentState.isOpen
	});

	// eslint-disable-next-line no-unused-vars
	useScrollPosition(({ prevPos, currPos }) => {
	    if (currPos.y < -Math.abs(tabsPanelTop)) return handleFixedHeader(true);
		
		return  handleFixedHeader(false);
	},[tabsPanelRef]);

	
	return (
		<Wrapper hideFooter={true}>
			<SC.MobileMainWrapper>
				<SC.Content>
					<Header
						match={match}
						handleTabsPanelRef={handleTabsPanelRef}
						fixedHeader={fixedHeader}
						openNewCommentView={()=> setCommentState(pv => ({ ...pv, isOpen :true }))}
						isNewCommentOpen={commentState.isOpen}
						setCommentState={setCommentState}
					/>
					<SC.Main className={mainClasses}>
						{children}
					</SC.Main>
					<Navigation
						newCommentViewHandler={newCommentViewHandler}
					/>
                    <Footer/>
                </SC.Content>
			</SC.MobileMainWrapper>
		</Wrapper>
	);
};

Template.propTypes = {
	setCommentState: PropTypes.func.isRequired,
	commentState: PropTypes.object.isRequired,
	children: PropTypes.object.isRequired,
	match: PropTypes.object.isRequired,
};

export default Template;