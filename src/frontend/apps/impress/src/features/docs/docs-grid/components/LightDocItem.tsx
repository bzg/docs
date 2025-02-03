import { ReactNode } from 'react';
import { css } from 'styled-components';

import { Box, StyledLink, Text } from '@/components';
import { useCunninghamTheme } from '@/cunningham';
import { Doc } from '@/features/docs/doc-management';

import Logo from './../assets/doc-s.svg';

const ItemTextCss = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: initial;
  display: -webkit-box;
  line-clamp: 1;
  width: 100%;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
`;

type Props = {
  doc: Doc;
  rightContent?: ReactNode;
};

export const LightDocItem = ({ doc, rightContent }: Props) => {
  const { spacingsTokens } = useCunninghamTheme();
  const spacing = spacingsTokens();
  return (
    <StyledLink
      href={`/docs/${doc.id}`}
      $css={css`
        width: 100%;
      `}
    >
      <Box
        $width="100%"
        $direction="row"
        $gap={spacing['xs']}
        $align="center"
        $css={css`
          .light-doc-item-actions {
            display: none;
          }
          &:hover {
            .light-doc-item-actions {
              display: flex;
            }
          }
        `}
      >
        <Box $width={16} $height={16}>
          <Logo />
        </Box>

        <Text $css={ItemTextCss} $size="sm">
          {doc.title}
        </Text>
        {rightContent && (
          <Box
            $direction="row"
            $gap={spacing['xs']}
            $align="center"
            className="light-doc-item-actions"
          >
            {rightContent}
          </Box>
        )}
      </Box>
    </StyledLink>
  );
};
